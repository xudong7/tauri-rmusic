import { onUnmounted, watch, type Ref } from "vue";
import { emit, listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useViewStore } from "@/stores/viewStore";
import { useLyricsOverlay } from "@/composables/useLyricsOverlay";
import { revealMainWindow, setMiniPlayerWindow } from "@/api/commands/system";
import type { PlaybackPhase, PlayMode } from "@/types/model";

export const MINI_PLAYER_STATE_EVENT = "mini-player-state";
export const MINI_PLAYER_READY_EVENT = "mini-player-ready";
export const MINI_PLAYER_ACTION_EVENT = "mini-player-action";
export const MINI_PLAYER_CLOSED_EVENT = "mini-player-closed";

/** mini 窗渲染所需的曲目身份。封面按来源分两种取法，所以两路都带上。 */
export interface MiniPlayerTrackPayload {
  title: string;
  artist: string;
  /** 在线歌曲封面地址；本地曲目为空串 */
  coverUrl: string;
  /** 本地曲目文件名（mini 窗自己调 load_local_cover_path）；在线曲目为空串 */
  coverFileName: string;
  /** 本地曲库目录，与 coverFileName 搭配解析封面；在线曲目为 null */
  defaultDirectory: string | null;
}

export interface MiniPlayerStatePayload {
  track: MiniPlayerTrackPayload | null;
  isPlaying: boolean;
  phase: PlaybackPhase;
  durationMs: number;
  positionMs: number;
  playMode: PlayMode;
  isLyricsOverlayOpen: boolean;
}

export type MiniPlayerActionPayload =
  | { action: "toggle-play" }
  | { action: "next" }
  | { action: "previous" }
  | { action: "seek"; positionMs: number }
  | { action: "toggle-play-mode" }
  | { action: "toggle-lyrics" }
  | { action: "restore-main" }
  | { action: "open-queue" };

/**
 * 主窗 → 迷你播放器的桥。
 *
 * 只推低频状态：曲目身份、播放/暂停、播放模式、歌词开关。进度不走主窗推送
 * ——主窗一旦被隐藏，它的播放时钟会停在 `document.hidden` 的守卫上——由
 * mini 窗自己轮询 get_playback_state + 本地时钟推进。positionMs 只在
 * 「mini 窗就绪 / 切歌」这类低频时机随快照播种一次。
 *
 * mini 窗的按钮不做任何实际动作，只把 `mini-player-action` 回抛到主窗：
 * 队列、歌单、本地曲库都是主窗独占的状态，动作必须在那边执行。
 */
export function useMiniPlayerBridge(isActive: Ref<boolean>) {
  const playerStore = usePlayerStore();
  const localStore = useLocalMusicStore();
  const viewStore = useViewStore();
  const { isLyricsOverlayOpen, toggleLyricsOverlay } = useLyricsOverlay();

  function currentTrack(): MiniPlayerTrackPayload | null {
    const info = playerStore.currentTrackInfo;
    if (!info) return null;
    const localFileName = playerStore.currentMusic?.file_name ?? "";
    return {
      title: info.name,
      artist: info.artist,
      coverUrl: info.picUrl,
      coverFileName: localFileName,
      defaultDirectory: localFileName ? localStore.getDefaultDirectory() : null,
    };
  }

  function snapshot(): MiniPlayerStatePayload {
    return {
      track: currentTrack(),
      isPlaying: playerStore.isPlaying,
      phase: playerStore.playbackPhase,
      durationMs: playerStore.currentTrackDuration,
      positionMs: playerStore.currentPlayTime,
      playMode: playerStore.playMode,
      isLyricsOverlayOpen: isLyricsOverlayOpen.value,
    };
  }

  function sendState() {
    if (!isActive.value) return;
    void emit(MINI_PLAYER_STATE_EVENT, snapshot());
  }

  function handleAction(event: Event<MiniPlayerActionPayload>) {
    const payload = event.payload;
    switch (payload.action) {
      case "toggle-play":
        void playerStore.togglePlay();
        break;
      case "next":
        void playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1));
        break;
      case "previous":
        void playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1));
        break;
      case "seek":
        void playerStore.seekToPosition(payload.positionMs);
        break;
      case "toggle-play-mode":
        playerStore.togglePlayMode();
        break;
      case "toggle-lyrics":
        void toggleLyricsOverlay();
        break;
      case "restore-main":
        // 只把主窗拉出来，迷你条保留（用户可以两个都开着）
        void revealMainWindow();
        break;
      case "open-queue":
        // 队列面板长在主窗上，且主窗会盖在迷你条下面；点队列就退出迷你模式，
        // 否则迷你条会一直悬浮在队列面板上方挡视线。
        viewStore.exitImmersive();
        viewStore.showPlaybackQueue = true;
        void revealMainWindow();
        void setMiniPlayerWindow({ open: false });
        break;
    }
  }

  const unlisteners: UnlistenFn[] = [];

  async function start() {
    stop();
    try {
      unlisteners.push(await listen(MINI_PLAYER_READY_EVENT, sendState));
      unlisteners.push(
        await listen<MiniPlayerActionPayload>(MINI_PLAYER_ACTION_EVENT, handleAction)
      );
    } catch (error) {
      stop();
      throw error;
    }
  }

  function stop() {
    while (unlisteners.length > 0) {
      unlisteners.pop()?.();
    }
  }

  watch(
    () => [
      playerStore.currentOnlineSong?.id,
      playerStore.currentMusic?.file_name,
      playerStore.isPlaying,
      playerStore.playbackPhase,
      playerStore.currentTrackDuration,
      playerStore.playMode,
      isLyricsOverlayOpen.value,
    ],
    sendState
  );

  onUnmounted(stop);

  return { start, stop, sendState };
}

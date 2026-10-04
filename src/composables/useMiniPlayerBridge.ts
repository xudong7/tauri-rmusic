import { onUnmounted, watch, type Ref } from "vue";
import { emit, listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useLyricsOverlay } from "@/composables/useLyricsOverlay";
import { revealMainWindow, setMiniPlayerWindow } from "@/api/commands/system";
import type { PlaybackPhase, PlaybackQueueItem, PlayMode } from "@/types/model";

export const MINI_PLAYER_STATE_EVENT = "mini-player-state";
export const MINI_PLAYER_QUEUE_EVENT = "mini-player-queue";
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
  /**
   * 进度只在「就绪握手 / 切歌」时给数值，其余推送为 null。
   *
   * 主窗在迷你模式下是隐藏的，它的播放时钟会停在 document.hidden 的守卫上，
   * currentPlayTime 因此是冻结的旧值。普通状态推送（切播放模式、开关歌词等）
   * 若带上它，mini 窗的进度条会在每次点击时跳回旧位置。null 表示「别动我的
   * 时钟」——mini 窗自己的 250ms 外推 + 1.5s 轮询才是权威进度。
   */
  positionMs: number | null;
  playMode: PlayMode;
  isLyricsOverlayOpen: boolean;
  /** 当前曲目在队列里的下标；不在队列中为 -1。队列列表本身走 QUEUE_EVENT。 */
  queueIndex: number;
}

/**
 * 队列行。不带 isCurrent：那一项每次切歌都变，带上的话整份队列（可能上千条）
 * 就得跟着重推；当前下标走 STATE_EVENT 的 queueIndex，便宜得多。
 */
export interface MiniPlayerQueueItem {
  key: string;
  title: string;
  artist: string;
  coverUrl: string;
  coverFileName: string;
  disabled?: boolean;
}

export interface MiniPlayerQueuePayload {
  title: string;
  items: MiniPlayerQueueItem[];
  /** 本地封面目录：队列里的本地曲目要在 mini 窗自己解析封面 */
  defaultDirectory: string | null;
}

export type MiniPlayerActionPayload =
  | { action: "toggle-play" }
  | { action: "next" }
  | { action: "previous" }
  | { action: "seek"; positionMs: number }
  | { action: "toggle-play-mode" }
  | { action: "toggle-lyrics" }
  | { action: "restore-main" }
  | { action: "play-queue-index"; index: number }
  | { action: "clear-queue" };

/**
 * 主窗 → 迷你播放器的桥。
 *
 * 只推低频状态：曲目身份、播放/暂停、播放模式、歌词开关、当前队列下标。
 * 进度不走主窗推送——主窗一旦被隐藏，它的播放时钟会停在 `document.hidden`
 * 的守卫上——由 mini 窗自己轮询 get_playback_state + 本地时钟推进。
 * positionMs 只在「mini 窗就绪 / 切歌」这类低频时机随快照播种一次。
 *
 * mini 窗的按钮不做任何实际动作，只把 `mini-player-action` 回抛到主窗：
 * 队列、歌单、本地曲库都是主窗独占的状态，动作必须在那边执行。
 */
export function useMiniPlayerBridge(isActive: Ref<boolean>) {
  const playerStore = usePlayerStore();
  const localStore = useLocalMusicStore();
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

  function currentQueueIndex(): number {
    return playerStore.playbackQueueItems.findIndex((item) => item.isCurrent);
  }

  function snapshot(includePosition: boolean): MiniPlayerStatePayload {
    return {
      track: currentTrack(),
      isPlaying: playerStore.isPlaying,
      phase: playerStore.playbackPhase,
      durationMs: playerStore.currentTrackDuration,
      positionMs: includePosition ? playerStore.currentPlayTime : null,
      playMode: playerStore.playMode,
      isLyricsOverlayOpen: isLyricsOverlayOpen.value,
      queueIndex: currentQueueIndex(),
    };
  }

  function sendState(includePosition = false) {
    if (!isActive.value) return;
    void emit(MINI_PLAYER_STATE_EVENT, snapshot(includePosition));
  }

  function toQueueItem(item: PlaybackQueueItem): MiniPlayerQueueItem {
    return {
      key: item.key,
      title: item.title,
      artist: item.artist,
      coverUrl: item.coverUrl ?? "",
      coverFileName: item.coverFileName ?? "",
      disabled: item.disabled,
    };
  }

  /**
   * 整份队列只在「列表本身变了」时推：对比序列化结果，挡掉切歌带来的
   * isCurrent 抖动（那由 queueIndex 承担）以及其它无关重算。
   */
  let lastQueueJson = "";
  function sendQueue() {
    if (!isActive.value) return;
    const payload: MiniPlayerQueuePayload = {
      title: playerStore.playbackQueueTitle,
      items: playerStore.playbackQueueItems.map(toQueueItem),
      defaultDirectory: localStore.getDefaultDirectory(),
    };
    const json = JSON.stringify(payload);
    if (json === lastQueueJson) return;
    lastQueueJson = json;
    void emit(MINI_PLAYER_QUEUE_EVENT, payload);
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
        // 切回正常界面：主窗出来，迷你条同时关掉——两个界面不允许共存
        void revealMainWindow();
        void setMiniPlayerWindow({ open: false });
        break;
      case "play-queue-index":
        void playerStore.playQueueItem(payload.index);
        break;
      case "clear-queue":
        playerStore.clearQueue();
        break;
    }
  }

  const unlisteners: UnlistenFn[] = [];

  async function start() {
    stop();
    try {
      // 就绪握手：mini 窗刚建好/重挂载，补发全量快照（含进度播种）与队列
      unlisteners.push(
        await listen(MINI_PLAYER_READY_EVENT, () => {
          sendState(true);
          sendQueue();
        })
      );
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
    (next, prev) => {
      // 只有切歌才播种进度：新曲目从 0 开始，即便主窗隐藏时这个值也是准的
      const trackChanged = next[0] !== prev?.[0] || next[1] !== prev?.[1];
      sendState(trackChanged);
    }
  );

  watch(
    () => [playerStore.playbackQueueItems, playerStore.playbackQueueTitle],
    () => sendQueue()
  );

  onUnmounted(stop);

  return { start, stop, sendState, sendQueue };
}

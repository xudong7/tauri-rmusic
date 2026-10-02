import { onUnmounted, watch, type Ref } from "vue";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";

export const LYRICS_OVERLAY_TRACK_EVENT = "lyrics-overlay-track";
export const LYRICS_OVERLAY_READY_EVENT = "lyrics-overlay-ready";
export const LYRICS_OVERLAY_CLOSED_EVENT = "lyrics-overlay-closed";

export type LyricsOverlaySource =
  | { type: "online"; id: string }
  | { type: "local"; fileName: string; defaultDirectory: string | null };

export interface LyricsOverlayTrackPayload {
  source: LyricsOverlaySource | null;
}

/**
 * 主窗 → 桌面歌词的桥。
 *
 * 只推低频状态：当前曲目的身份。进度不走主窗的播放时钟——主窗一旦被隐藏，
 * 播放时钟会停在 `document.hidden` 的守卫上。悬浮窗自己是可见窗口，
 * 由它轮询 get_playback_state + 本地时钟计算当前行。
 */
export function useLyricsOverlayBridge(isActive: Ref<boolean>) {
  const playerStore = usePlayerStore();
  const localStore = useLocalMusicStore();

  function currentSource(): LyricsOverlaySource | null {
    const online = playerStore.currentOnlineSong;
    if (online) return { type: "online", id: online.id };
    const local = playerStore.currentMusic;
    if (local) {
      return {
        type: "local",
        fileName: local.file_name,
        defaultDirectory: localStore.getDefaultDirectory(),
      };
    }
    return null;
  }

  function sendTrack() {
    if (!isActive.value) return;
    const payload: LyricsOverlayTrackPayload = { source: currentSource() };
    void emit(LYRICS_OVERLAY_TRACK_EVENT, payload);
  }

  let unlistenReady: UnlistenFn | null = null;
  void listen(LYRICS_OVERLAY_READY_EVENT, sendTrack)
    .then((unlisten) => {
      unlistenReady = unlisten;
    })
    .catch((error) => {
      // 非 Tauri 环境（单测/浏览器预览）没有事件系统，静默降级
      console.warn("[桌面歌词] 监听悬浮窗就绪事件失败:", error);
    });

  watch(
    () => [playerStore.currentOnlineSong?.id, playerStore.currentMusic?.file_name],
    sendTrack
  );

  onUnmounted(() => {
    unlistenReady?.();
    unlistenReady = null;
  });
}

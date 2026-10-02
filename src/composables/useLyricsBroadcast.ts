import { onUnmounted, ref, watch, type Ref } from "vue";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MusicFile, SongInfo } from "@/types/model";
import { getSongLyric } from "@/api/commands/netease";
import { loadLocalLyric } from "@/api/commands/file";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useLyricOffset } from "@/composables/useLyricOffset";
import {
  findLyricIndex,
  getCachedLyric,
  parseLyric,
  parseLyricWithTranslation,
  setCachedLyric,
  type LyricLine,
} from "@/utils/lyrics";

export interface LyricsOverlayPayload {
  current: string;
  translation: string;
  next: string;
}

export const LYRICS_OVERLAY_UPDATE_EVENT = "lyrics-overlay-update";
export const LYRICS_OVERLAY_READY_EVENT = "lyrics-overlay-ready";
export const LYRICS_OVERLAY_CLOSED_EVENT = "lyrics-overlay-closed";

/**
 * 把当前歌词行推送给桌面歌词窗。
 *
 * 主窗与悬浮窗是两个 webview，不共享状态；这里只做「跟随当前曲目加载歌词 +
 * 按进度算当前行 + 事件推送」，歌词解析缓存与 LyricView 共用（utils/lyrics 的
 * LRU），同一首歌不会重复请求。
 */
export function useLyricsBroadcast(isActive: Ref<boolean>) {
  const playerStore = usePlayerStore();
  const localStore = useLocalMusicStore();
  const { offsetMs } = useLyricOffset();

  const lines = ref<LyricLine[]>([]);
  let requestId = 0;
  let lastPayloadKey = "";

  async function loadFor(song: SongInfo | null, music: MusicFile | null) {
    const id = ++requestId;
    lines.value = [];

    if (song) {
      const key = `online:${song.id}`;
      const cached = getCachedLyric(key);
      if (cached) {
        lines.value = cached;
        return;
      }
      try {
        const result = await getSongLyric({ id: song.id });
        if (id !== requestId) return;
        const parsed = result.lyric
          ? parseLyricWithTranslation(result.lyric, result.translation)
          : [];
        if (parsed.length) setCachedLyric(key, parsed);
        lines.value = parsed;
      } catch (error) {
        console.warn("[桌面歌词] 加载在线歌词失败:", error);
      }
      return;
    }

    if (music) {
      const key = `local:${music.file_name}`;
      const cached = getCachedLyric(key);
      if (cached) {
        lines.value = cached;
        return;
      }
      try {
        const text = await loadLocalLyric({
          fileName: music.file_name,
          defaultDirectory: localStore.getDefaultDirectory(),
        });
        if (id !== requestId) return;
        const parsed = text ? parseLyric(text) : [];
        if (parsed.length) setCachedLyric(key, parsed);
        lines.value = parsed;
      } catch (error) {
        console.warn("[桌面歌词] 加载本地歌词失败:", error);
      }
    }
  }

  function broadcast() {
    if (!isActive.value) return;
    const index = findLyricIndex(
      lines.value,
      playerStore.currentPlayTime - offsetMs.value
    );
    const current = index >= 0 ? lines.value[index] : null;
    const next = index >= 0 ? (lines.value[index + 1] ?? null) : null;
    const payload: LyricsOverlayPayload = {
      current: current?.text ?? "",
      translation: current?.translation ?? "",
      next: next?.text ?? "",
    };
    const key = JSON.stringify(payload);
    if (key === lastPayloadKey) return;
    lastPayloadKey = key;
    void emit(LYRICS_OVERLAY_UPDATE_EVENT, payload);
  }

  let unlistenReady: UnlistenFn | null = null;
  void listen(LYRICS_OVERLAY_READY_EVENT, () => {
    // 悬浮窗刚挂载、监听刚建立时会请求一次当前状态
    lastPayloadKey = "";
    broadcast();
  })
    .then((unlisten) => {
      unlistenReady = unlisten;
    })
    .catch((error) => {
      // 非 Tauri 环境（单测/浏览器预览）没有事件系统，静默降级
      console.warn("[桌面歌词] 监听悬浮窗就绪事件失败:", error);
    });

  watch(
    () => [playerStore.currentOnlineSong?.id, playerStore.currentMusic?.file_name],
    () => {
      void loadFor(playerStore.currentOnlineSong, playerStore.currentMusic);
    },
    { immediate: true }
  );

  watch([() => playerStore.currentPlayTime, offsetMs, lines, isActive], () =>
    broadcast()
  );

  onUnmounted(() => {
    unlistenReady?.();
    unlistenReady = null;
  });
}

import { onMounted, onUnmounted, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { revealMainWindow, updateMediaMetadata } from "@/api/commands/system";
import { cacheOnlineCover } from "@/api/commands/netease";
import type { MediaMetadataUpdate } from "@/api/types";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { loadLocalCoverFileUrl, toFileUrl } from "@/utils/coverUtils";
import { formatArtists, getLocalMusicDisplayInfo } from "@/utils/songUtils";

/** 进度写回系统控件的节流间隔：系统只拿它做进度条，不需要跟到 250ms */
const METADATA_THROTTLE_MS = 5000;

export const MEDIA_CONTROL_EVENT = "media-control";

type MediaControlPayload =
  | { action: "play" }
  | { action: "pause" }
  | { action: "toggle" }
  | { action: "stop" }
  | { action: "next" }
  | { action: "previous" }
  | { action: "seek_relative"; offset_ms: number }
  | { action: "seek_absolute"; position_ms: number }
  | { action: "set_volume"; volume: number }
  | { action: "raise" };

/**
 * 系统媒体控制桥接：把播放状态推给 macOS Now Playing / Windows SMTC /
 * Linux MPRIS，并把系统媒体键事件映射回既有的播放控制路径（与托盘、
 * 快捷键共用 playerStore 的同一组动作）。
 */
export function useSystemMediaControls() {
  const playerStore = usePlayerStore();
  const localStore = useLocalMusicStore();

  let unlisten: UnlistenFn | null = null;
  let lastPushAt = 0;
  let coverRequestId = 0;

  async function pushMetadata(force = false) {
    if (!force && Date.now() - lastPushAt < METADATA_THROTTLE_MS) return;
    lastPushAt = Date.now();

    const online = playerStore.currentOnlineSong;
    const local = playerStore.currentMusic;

    if (!online && !local) {
      const empty: MediaMetadataUpdate = {
        title: "",
        artist: "",
        album: "",
        // 空串不是合法 URL：macOS 的 souvlaki 会因此崩溃，必须传 null
        coverUrl: null,
        durationMs: 0,
        positionMs: 0,
        isPlaying: false,
        volume: playerStore.volume / 100,
      };
      try {
        await updateMediaMetadata({ payload: empty });
      } catch (error) {
        console.warn("[系统媒体控制] 清空元数据失败:", error);
      }
      return;
    }

    /**
     * 封面统一转成本地 file:// 或 null。
     *
     * macOS 的 souvlaki 是同步加载封面的，且对加载失败的 NSImage 不做空检查
     * ——远程 URL 取图失败或空串都会直接崩掉进程（见 Rust 侧 sanitize_cover_url）。
     * 在线封面先经磁盘缓存落盘再传本地路径，顺带避免主线程同步网络请求。
     */
    const requestId = ++coverRequestId;
    let coverUrl: string | null = null;
    let payload: MediaMetadataUpdate;

    if (online) {
      payload = {
        title: online.name,
        artist: formatArtists(online.artists),
        album: online.album ?? "",
        coverUrl: null,
        durationMs: playerStore.currentTrackDuration,
        positionMs: playerStore.currentPlayTime,
        isPlaying: playerStore.isPlaying,
        volume: playerStore.volume / 100,
      };
      if (online.pic_url) {
        try {
          const path = await cacheOnlineCover({ url: online.pic_url });
          coverUrl = path ? toFileUrl(path) : null;
        } catch (error) {
          console.warn("[系统媒体控制] 缓存封面失败:", error);
        }
        if (requestId !== coverRequestId) return;
      }
    } else {
      const info = getLocalMusicDisplayInfo(local!, "");
      payload = {
        title: info.title,
        artist: info.artist,
        album: info.album ?? "",
        coverUrl: null,
        durationMs: playerStore.currentTrackDuration,
        positionMs: playerStore.currentPlayTime,
        isPlaying: playerStore.isPlaying,
        volume: playerStore.volume / 100,
      };
      const fileUrl = await loadLocalCoverFileUrl(local!.file_name, () =>
        localStore.getDefaultDirectory()
      );
      if (requestId !== coverRequestId) return;
      coverUrl = fileUrl || null;
    }

    payload.coverUrl = coverUrl;
    try {
      await updateMediaMetadata({ payload });
    } catch (error) {
      console.warn("[系统媒体控制] 更新元数据失败:", error);
    }
  }

  function handleMediaControl(payload: MediaControlPayload) {
    switch (payload.action) {
      case "play":
        if (!playerStore.isPlaying) void playerStore.togglePlay();
        break;
      case "pause":
      case "stop":
        if (playerStore.isPlaying) void playerStore.togglePlay();
        break;
      case "toggle":
        void playerStore.togglePlay();
        break;
      case "next":
        void playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1));
        break;
      case "previous":
        void playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1));
        break;
      case "seek_relative":
        void playerStore.seekToPosition(playerStore.currentPlayTime + payload.offset_ms);
        break;
      case "seek_absolute":
        void playerStore.seekToPosition(payload.position_ms);
        break;
      case "set_volume":
        playerStore.adjustVolume(Math.round(payload.volume * 100));
        break;
      case "raise":
        // 系统面板上的「打开播放器」
        void revealMainWindow();
        break;
    }
  }

  watch(
    () => [
      playerStore.currentOnlineSong?.id,
      playerStore.currentMusic?.file_name,
      playerStore.isPlaying,
      playerStore.volume,
    ],
    () => void pushMetadata(true),
    { immediate: true }
  );

  watch(
    () => playerStore.currentPlayTime,
    () => void pushMetadata(false)
  );

  onMounted(async () => {
    try {
      unlisten = await listen<MediaControlPayload>(MEDIA_CONTROL_EVENT, (event) => {
        handleMediaControl(event.payload);
      });
    } catch (error) {
      console.warn("[系统媒体控制] 监听媒体键失败:", error);
    }
  });

  onUnmounted(() => {
    unlisten?.();
    unlisten = null;
  });
}

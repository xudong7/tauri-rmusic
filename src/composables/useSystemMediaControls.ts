import { onMounted, onUnmounted, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { revealMainWindow, updateMediaMetadata } from "@/api/commands/system";
import type { MediaMetadataUpdate } from "@/api/types";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { loadLocalCoverFileUrl } from "@/utils/coverUtils";
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
        coverUrl: "",
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

    let payload: MediaMetadataUpdate;
    if (online) {
      payload = {
        title: online.name,
        artist: formatArtists(online.artists),
        album: online.album ?? "",
        coverUrl: online.pic_url ?? "",
        durationMs: playerStore.currentTrackDuration,
        positionMs: playerStore.currentPlayTime,
        isPlaying: playerStore.isPlaying,
        volume: playerStore.volume / 100,
      };
    } else {
      const info = getLocalMusicDisplayInfo(local!, "");
      payload = {
        title: info.title,
        artist: info.artist,
        album: info.album ?? "",
        coverUrl: "",
        durationMs: playerStore.currentTrackDuration,
        positionMs: playerStore.currentPlayTime,
        isPlaying: playerStore.isPlaying,
        volume: playerStore.volume / 100,
      };
      // 本地封面要经 IPC 取路径；取回来时若已切歌就丢弃
      const requestId = ++coverRequestId;
      const fileUrl = await loadLocalCoverFileUrl(local!.file_name, () =>
        localStore.getDefaultDirectory()
      );
      if (requestId !== coverRequestId) return;
      payload.coverUrl = fileUrl;
    }

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

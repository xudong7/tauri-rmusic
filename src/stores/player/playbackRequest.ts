import type { Ref } from "vue";
import type { MusicFile, PlaybackPhase, SongInfo } from "@/types/model";

interface PlaybackSnapshot {
  music: MusicFile | null;
  onlineSong: SongInfo | null;
  localQueue: MusicFile[];
  onlineQueue: SongInfo[];
  playlistId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  backendTrackId: number;
}

export interface PlaybackRequestContext {
  currentMusic: Ref<MusicFile | null>;
  currentOnlineSong: Ref<SongInfo | null>;
  currentLocalQueue: Ref<MusicFile[]>;
  currentOnlineQueue: Ref<SongInfo[]>;
  currentPlaylistId: Ref<string | null>;
  isPlaying: Ref<boolean>;
  isLoadingSong: Ref<boolean>;
  playbackPhase: Ref<PlaybackPhase>;
  currentPlayTime: Ref<number>;
  currentTrackDurationMs: Ref<number>;
  currentBackendTrackId: Ref<number>;
  startPlayTimeTracking: () => void;
  stopPlayTimeTracking: () => void;
}

/**
 * 播放请求的生命周期。
 *
 * 每次切歌生成一个递增的 requestId：异步步骤回来后若已不是最新请求，
 * 结果直接丢弃。失败时回滚到请求发起前的快照，避免 UI 停在半途状态。
 */
export function createPlaybackRequestController(ctx: PlaybackRequestContext) {
  // 时间基准避免 WebView/HMR 重载后编号回到 1，与仍在运行的 Rust 状态冲突。
  // 乘以 1000 为同一毫秒内的连续切歌预留递增空间，数值仍在 JS 安全整数范围内。
  let requestId = Date.now() * 1000;
  let fallbackSnapshot: PlaybackSnapshot | null = null;

  function resetProgressState() {
    ctx.currentPlayTime.value = 0;
    ctx.currentTrackDurationMs.value = 0;
    ctx.currentBackendTrackId.value = 0;
  }

  function captureSnapshot(): PlaybackSnapshot {
    return {
      music: ctx.currentMusic.value,
      onlineSong: ctx.currentOnlineSong.value,
      localQueue: [...ctx.currentLocalQueue.value],
      onlineQueue: [...ctx.currentOnlineQueue.value],
      playlistId: ctx.currentPlaylistId.value,
      isPlaying: ctx.isPlaying.value,
      positionMs: ctx.currentPlayTime.value,
      durationMs: ctx.currentTrackDurationMs.value,
      backendTrackId: ctx.currentBackendTrackId.value,
    };
  }

  function restoreSnapshot(snapshot: PlaybackSnapshot) {
    ctx.currentMusic.value = snapshot.music;
    ctx.currentOnlineSong.value = snapshot.onlineSong;
    ctx.currentLocalQueue.value = snapshot.localQueue;
    ctx.currentOnlineQueue.value = snapshot.onlineQueue;
    ctx.currentPlaylistId.value = snapshot.playlistId;
    ctx.currentPlayTime.value = snapshot.positionMs;
    ctx.currentTrackDurationMs.value = snapshot.durationMs;
    ctx.currentBackendTrackId.value = snapshot.backendTrackId;
    ctx.isPlaying.value = snapshot.isPlaying;
    ctx.isLoadingSong.value = false;
    ctx.playbackPhase.value = "idle";
    if (snapshot.isPlaying && (snapshot.music || snapshot.onlineSong)) {
      ctx.startPlayTimeTracking();
    } else {
      ctx.stopPlayTimeTracking();
    }
  }

  function begin(): number {
    if (!ctx.isLoadingSong.value || fallbackSnapshot === null) {
      fallbackSnapshot = captureSnapshot();
    }
    requestId = Math.max(requestId + 1, Date.now() * 1000);
    ctx.isLoadingSong.value = true;
    ctx.isPlaying.value = false;
    ctx.stopPlayTimeTracking();
    resetProgressState();
    return requestId;
  }

  function isCurrent(id: number): boolean {
    return id === requestId;
  }

  function complete(id: number): boolean {
    if (!isCurrent(id)) return false;
    ctx.isLoadingSong.value = false;
    ctx.playbackPhase.value = "idle";
    fallbackSnapshot = null;
    return true;
  }

  function fail(id: number): void {
    if (!isCurrent(id)) return;
    const snapshot = fallbackSnapshot;
    fallbackSnapshot = null;
    if (snapshot) restoreSnapshot(snapshot);
    else {
      ctx.isLoadingSong.value = false;
      ctx.playbackPhase.value = "idle";
    }
  }

  function isSuperseded(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("playback request superseded");
  }

  return { begin, isCurrent, complete, fail, isSuperseded };
}

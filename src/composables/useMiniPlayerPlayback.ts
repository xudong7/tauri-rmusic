import { onMounted, onUnmounted, ref } from "vue";
import { emit, listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { getPlaybackState } from "@/api/commands/music";
import { loadLocalCover, loadOnlineCover } from "@/utils/coverUtils";
import {
  MINI_PLAYER_ACTION_EVENT,
  MINI_PLAYER_READY_EVENT,
  MINI_PLAYER_STATE_EVENT,
  type MiniPlayerActionPayload,
  type MiniPlayerStatePayload,
  type MiniPlayerTrackPayload,
} from "@/composables/useMiniPlayerBridge";
import { PlayMode, type PlaybackPhase } from "@/types/model";

/** 与后端对表间隔：行内平滑由本地时钟补，轮询只负责纠偏（同桌面歌词） */
const POSITION_POLL_MS = 1500;
const TICK_MS = 250;

/**
 * 迷你播放器窗自己的播放状态。
 *
 * 这个窗口不挂载 playerStore（队列、歌单、本地曲库都是主窗独占的状态），
 * 状态来源只有两处：主窗推来的低频快照 `mini-player-state`，以及自己轮询
 * `get_playback_state` 得到的权威进度。主窗被隐藏后它的播放时钟会停摆，
 * 所以进度必须由这里自己外推——这正是桌面歌词踩过的坑。
 */
export function useMiniPlayerPlayback() {
  const track = ref<MiniPlayerTrackPayload | null>(null);
  const coverUrl = ref("");
  const isPlaying = ref(false);
  const phase = ref<PlaybackPhase>("idle");
  const durationMs = ref(0);
  const positionMs = ref(0);
  const playMode = ref<PlayMode>(PlayMode.SEQUENTIAL);
  const isLyricsOverlayOpen = ref(false);

  let tickTimer: number | null = null;
  let unlistenState: UnlistenFn | null = null;
  let lastPollAt = 0;
  let anchorTimestamp = 0;
  let coverRequestId = 0;
  let lastCoverKey = "";

  /** 以某个位置为基准重新锚定本地时钟（之后由 Date.now 外推） */
  function anchorTo(position: number) {
    positionMs.value = Math.max(0, position);
    anchorTimestamp = Date.now() - positionMs.value;
  }

  /** 封面按来源二选一：在线走磁盘缓存，本地经 IPC 取路径；两者内部都有缓存 */
  async function refreshCover(source: MiniPlayerTrackPayload) {
    const requestId = ++coverRequestId;
    let resolved = "";
    try {
      if (source.coverUrl) {
        resolved = await loadOnlineCover(source.coverUrl);
      } else if (source.coverFileName) {
        resolved = await loadLocalCover(
          source.coverFileName,
          () => source.defaultDirectory
        );
      }
    } catch (error) {
      console.warn("[迷你播放器] 加载封面失败:", error);
    }
    if (requestId === coverRequestId) coverUrl.value = resolved;
  }

  function coverKeyOf(next: MiniPlayerTrackPayload | null): string {
    if (!next) return "";
    if (next.coverUrl) return `online\u0000${next.coverUrl}`;
    if (next.coverFileName) {
      return `local\u0000${next.defaultDirectory ?? "<default>"}\u0000${next.coverFileName}`;
    }
    return "";
  }

  function applySnapshot(payload: MiniPlayerStatePayload) {
    track.value = payload.track;
    isPlaying.value = payload.isPlaying;
    phase.value = payload.phase;
    durationMs.value = payload.durationMs;
    playMode.value = payload.playMode;
    isLyricsOverlayOpen.value = payload.isLyricsOverlayOpen;
    // 快照里的 position 只在低频时机播种；之后由本地时钟接管
    anchorTo(payload.positionMs);

    const nextCoverKey = coverKeyOf(payload.track);
    if (nextCoverKey !== lastCoverKey) {
      lastCoverKey = nextCoverKey;
      if (payload.track && nextCoverKey) {
        void refreshCover(payload.track);
      } else {
        coverRequestId++;
        coverUrl.value = "";
      }
    }
  }

  /** 从后端取权威进度与播放状态；本地时钟负责两次轮询之间的推进 */
  async function resync() {
    lastPollAt = Date.now();
    try {
      const state = await getPlaybackState();
      if (!state.has_track) {
        isPlaying.value = false;
        anchorTo(0);
        return;
      }
      isPlaying.value = !state.is_paused && !state.is_ended;
      if (state.duration_ms > 0) durationMs.value = state.duration_ms;
      anchorTo(state.position_ms);
    } catch (error) {
      console.warn("[迷你播放器] 同步播放进度失败:", error);
    }
  }

  function tick() {
    if (isPlaying.value) positionMs.value = Date.now() - anchorTimestamp;
    if (Date.now() - lastPollAt >= POSITION_POLL_MS) void resync();
  }

  function sendAction(payload: MiniPlayerActionPayload) {
    void emit(MINI_PLAYER_ACTION_EVENT, payload);
  }

  function togglePlay() {
    sendAction({ action: "toggle-play" });
  }

  function previous() {
    sendAction({ action: "previous" });
  }

  function next() {
    sendAction({ action: "next" });
  }

  function togglePlayMode() {
    sendAction({ action: "toggle-play-mode" });
  }

  function toggleLyrics() {
    sendAction({ action: "toggle-lyrics" });
  }

  function restoreMain() {
    sendAction({ action: "restore-main" });
  }

  function openQueue() {
    sendAction({ action: "open-queue" });
  }

  function seekTo(targetMs: number) {
    // 乐观锚定：先把本地时钟搬到目标位置，否则进度条会在轮询纠偏前回跳
    anchorTo(targetMs);
    sendAction({ action: "seek", positionMs: targetMs });
  }

  onMounted(async () => {
    try {
      unlistenState = await listen<MiniPlayerStatePayload>(
        MINI_PLAYER_STATE_EVENT,
        (event: Event<MiniPlayerStatePayload>) => applySnapshot(event.payload)
      );
    } catch (error) {
      console.warn("[迷你播放器] 监听状态失败:", error);
    }

    tickTimer = window.setInterval(tick, TICK_MS);
    void resync();
    // 通知主窗补发当前快照：本监听建立前推送的那条会丢
    void emit(MINI_PLAYER_READY_EVENT);
  });

  onUnmounted(() => {
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    unlistenState?.();
    unlistenState = null;
  });

  return {
    track,
    coverUrl,
    isPlaying,
    phase,
    durationMs,
    positionMs,
    playMode,
    isLyricsOverlayOpen,
    togglePlay,
    previous,
    next,
    togglePlayMode,
    toggleLyrics,
    restoreMain,
    openQueue,
    seekTo,
  };
}

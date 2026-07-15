import type { PlaybackState } from "@/api/commands/music";

const UI_TICK_INTERVAL_MS = 250;
const BACKEND_SYNC_INTERVAL_MS = 10_000;

export function usePlaybackClock(options: {
  getBackendState: () => Promise<PlaybackState>;
  getCurrentPosition: () => number;
  getIsPlaying: () => boolean;
  getHasTrack: () => boolean;
  getIsLoading: () => boolean;
  setPosition: (positionMs: number) => void;
  setDuration: (durationMs: number) => void;
  shouldAcceptState?: (state: PlaybackState) => boolean;
  onEnded: () => Promise<void>;
}) {
  let interval: number | null = null;
  let playStartTimestamp = 0;
  let lastBackendSync = 0;
  let syncInFlight: Promise<void> | null = null;
  let handlingEnded = false;

  function resetLocalClock(positionMs = options.getCurrentPosition()) {
    playStartTimestamp = Date.now() - positionMs;
  }

  async function handleEnded() {
    if (handlingEnded || options.getIsLoading()) return;
    handlingEnded = true;
    try {
      await options.onEnded();
    } finally {
      handlingEnded = false;
    }
  }

  async function syncNow({ allowEnded = true } = {}) {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      const state = await options.getBackendState();
      if (options.shouldAcceptState && !options.shouldAcceptState(state)) return;
      if (state.duration_ms > 0) options.setDuration(state.duration_ms);
      options.setPosition(state.position_ms);
      resetLocalClock(state.position_ms);
      lastBackendSync = Date.now();
      if (allowEnded && state.is_ended && state.has_track) {
        await handleEnded();
      }
    })().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  }

  function tick() {
    if (document.hidden || !options.getHasTrack() || options.getIsLoading()) return;

    if (options.getIsPlaying()) {
      options.setPosition(Date.now() - playStartTimestamp);
    }

    if (Date.now() - lastBackendSync >= BACKEND_SYNC_INTERVAL_MS) {
      void syncNow().catch((error) => {
        console.error("[播放时钟] 同步后端状态失败:", error);
        lastBackendSync = Date.now();
      });
    }
  }

  function handleVisibilityChange() {
    if (document.hidden || !options.getHasTrack() || options.getIsLoading()) return;
    void syncNow({ allowEnded: false }).catch((error) => {
      console.error("[播放时钟] 窗口恢复时同步后端状态失败:", error);
      lastBackendSync = Date.now();
    });
  }

  function start() {
    stop({ updatePosition: false });
    resetLocalClock();
    lastBackendSync = 0;
    void syncNow({ allowEnded: false }).catch((error) => {
      console.error("[播放时钟] 初始同步后端状态失败:", error);
      lastBackendSync = Date.now();
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    interval = window.setInterval(tick, UI_TICK_INTERVAL_MS);
  }

  function stop(optionsArg: { updatePosition?: boolean } = {}) {
    const updatePosition = optionsArg.updatePosition ?? true;
    if (interval !== null) {
      if (updatePosition && options.getIsPlaying()) {
        options.setPosition(Date.now() - playStartTimestamp);
      }
      clearInterval(interval);
      interval = null;
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  function setPosition(positionMs: number) {
    options.setPosition(positionMs);
    resetLocalClock(positionMs);
  }

  function reset() {
    stop({ updatePosition: false });
    playStartTimestamp = 0;
    lastBackendSync = 0;
    handlingEnded = false;
  }

  return {
    start,
    stop,
    reset,
    setPosition,
    syncNow,
  };
}

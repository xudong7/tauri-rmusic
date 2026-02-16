/**
 * 播放结束检测 composable：当 Sink 连续空时自动切下一首
 * 从 App.vue 抽离，降低 App 内聚、便于维护
 */
import { isSinkEmpty } from "@/api/commands/music";
import { PlayMode } from "@/types/model";
const CHECK_INTERVAL = 1000;
const REQUIRED_EMPTY_COUNT = 3;
const MIN_TIME_BETWEEN_CHECKS = 1000;

/** 需具备 hasCurrentTrack、isLoadingSong、isPlaying、stopPlayTimeTracking、playNextOrPreviousMusic、playMode */
export function usePlaybackDetector(
  store: {
    hasCurrentTrack: boolean;
    isLoadingSong: boolean;
    isPlaying: boolean;
    playMode: PlayMode;
    stopPlayTimeTracking: () => void;
    playNextOrPreviousMusic: (step: number) => Promise<void>;
    replayCurrentSong: () => Promise<void>;
  },
  getPlayStep: (direction: number) => number
) {
  let interval: number | null = null;
  let consecutiveEmptyCount = 0;
  let lastCheckTime = 0;

  function resetCounters() {
    consecutiveEmptyCount = 0;
    lastCheckTime = Date.now();
  }

  function shouldAutoPlayNext(): boolean {
    if (!store.hasCurrentTrack || store.isLoadingSong) return false;
    return true;
  }

  async function checkPlaybackStatus() {
    if (!shouldAutoPlayNext()) {
      resetCounters();
      return;
    }
    try {
      const isEmpty = await isSinkEmpty();
      const now = Date.now();
      if (isEmpty) {
        consecutiveEmptyCount++;
        if (
          consecutiveEmptyCount >= REQUIRED_EMPTY_COUNT &&
          now - lastCheckTime > MIN_TIME_BETWEEN_CHECKS
        ) {
          (store as { isPlaying: boolean }).isPlaying = false;
          store.stopPlayTimeTracking();
          await new Promise((r) => setTimeout(r, 500));

          if (store.playMode === PlayMode.REPEAT_ONE) {
            await store.replayCurrentSong();
          } else {
            await store.playNextOrPreviousMusic(getPlayStep(1));
          }
          resetCounters();
        }
      } else {
        consecutiveEmptyCount = 0;
      }
    } catch (e) {
      console.error("[播放检测器] 检查失败:", e);
      resetCounters();
    }
  }

  function start() {
    stop();
    resetCounters();
    interval = window.setInterval(checkPlaybackStatus, CHECK_INTERVAL);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    resetCounters();
  }

  return { start, stop };
}

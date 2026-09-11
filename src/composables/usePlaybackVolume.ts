import { ref } from "vue";
import { STORAGE_KEY_PLAYER_VOLUME } from "@/constants";

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(100, volume));
}

function readSavedVolume(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY_PLAYER_VOLUME));
  return Number.isFinite(saved) ? clampVolume(saved) : 50;
}

/**
 * 静音切换：记住静音前的音量，再点一次恢复。
 *
 * PlayerBar 与沉浸页都要用，所以放在这里而不是各写一份。
 * 2026-09 之前这段逻辑只存在于 PlayerBar 内部。
 *
 * 记忆值在**静音的那一刻**记录，而不是用 watch 跟踪音量变化：
 * watch 是预刷新（异步）的，用户在同一个事件循环里改完音量再点静音会读到旧值；
 * 而「点静音时手上是多少」本来就不需要额外状态。
 */
export function useVolumeMute(options: {
  /** 当前音量来源（通常是 store 里的 volume，两个组件共用同一份） */
  currentVolume: () => number;
  /** 音量变化回调，由调用方接到自己的 adjustVolume 上 */
  onChange: (volume: number) => void;
}) {
  let lastAudibleVolume = options.currentVolume() > 0 ? options.currentVolume() : 50;

  function toggleMute() {
    const current = options.currentVolume();
    if (current > 0) {
      lastAudibleVolume = current;
      options.onChange(0);
      return;
    }
    options.onChange(lastAudibleVolume);
  }

  return { toggleMute };
}

export function usePlaybackVolume(options: {
  setBackendVolume: (volume: number) => Promise<void>;
}) {
  const volume = ref(readSavedVolume());

  async function adjustVolume(nextVolume: number) {
    const safeVolume = clampVolume(nextVolume);
    volume.value = safeVolume;
    localStorage.setItem(STORAGE_KEY_PLAYER_VOLUME, String(safeVolume));

    try {
      await options.setBackendVolume(safeVolume);
    } catch (error) {
      console.error("[播放控制] 调整音量失败:", error);
    }
  }

  async function syncVolumeToBackend() {
    try {
      await options.setBackendVolume(volume.value);
    } catch (error) {
      console.error("[播放控制] 同步音量失败:", error);
    }
  }

  return {
    volume,
    adjustVolume,
    syncVolumeToBackend,
  };
}

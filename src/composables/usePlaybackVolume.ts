import { ref } from "vue";
import { STORAGE_KEY_PLAYER_VOLUME } from "@/constants";

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(100, volume));
}

function readSavedVolume(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY_PLAYER_VOLUME));
  return Number.isFinite(saved) ? clampVolume(saved) : 50;
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

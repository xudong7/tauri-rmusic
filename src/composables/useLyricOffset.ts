import { ref } from "vue";
import {
  LYRICS_OFFSET_MAX_MS,
  LYRICS_OFFSET_STEP_MS,
  STORAGE_KEY_LYRIC_OFFSET,
} from "@/constants";

/**
 * 歌词偏移（全局，跨会话保留）。
 *
 * 语义：显示时间 = 播放时间 − offset。值为正表示歌词整体延后出现，
 * 用来修正「歌词比声音快了」的源；点歌词跳转时补偿同一个偏移。
 */
function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    -LYRICS_OFFSET_MAX_MS,
    Math.min(LYRICS_OFFSET_MAX_MS, Math.round(value))
  );
}

function readStoredOffset(): number {
  const stored = Number.parseInt(
    localStorage.getItem(STORAGE_KEY_LYRIC_OFFSET) ?? "",
    10
  );
  return clampOffset(Number.isNaN(stored) ? 0 : stored);
}

const offsetMs = ref(readStoredOffset());

function persist() {
  localStorage.setItem(STORAGE_KEY_LYRIC_OFFSET, String(offsetMs.value));
}

export function useLyricOffset() {
  function adjustOffset(deltaMs: number = LYRICS_OFFSET_STEP_MS) {
    offsetMs.value = clampOffset(offsetMs.value + deltaMs);
    persist();
  }

  function resetOffset() {
    if (offsetMs.value === 0) return;
    offsetMs.value = 0;
    persist();
  }

  return { offsetMs, adjustOffset, resetOffset };
}

import { computed, onScopeDispose, ref, watch } from "vue";

const SEEK_RELEASE_DELAY_MS = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: number | number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : value;
}

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function usePlaybackProgressSlider(args: {
  currentTime: () => number;
  duration: () => number;
  hasTrack: () => boolean;
  onSeek: (positionMs: number) => void;
}) {
  const sliderValue = ref(0);
  const isPreviewing = ref(false);
  let releaseTimer: number | null = null;

  const durationMs = computed(() => Math.max(0, args.duration() || 0));
  const currentTimeMs = computed(() =>
    durationMs.value > 0
      ? clamp(args.currentTime() || 0, 0, durationMs.value)
      : Math.max(0, args.currentTime() || 0)
  );
  const progressDisabled = computed(() => !args.hasTrack() || durationMs.value <= 0);
  const progressPercent = computed(() => {
    if (durationMs.value <= 0) return 0;
    return clamp((currentTimeMs.value / durationMs.value) * 100, 0, 100);
  });
  const currentTimeDisplay = computed(() => formatTime(currentTimeMs.value));
  const durationDisplay = computed(() => formatTime(durationMs.value));

  function clearReleaseTimer() {
    if (releaseTimer !== null) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  }

  function releasePreviewSoon() {
    clearReleaseTimer();
    releaseTimer = window.setTimeout(() => {
      isPreviewing.value = false;
      sliderValue.value = progressPercent.value;
      releaseTimer = null;
    }, SEEK_RELEASE_DELAY_MS);
  }

  function handleProgressInput(value: number | number[]) {
    clearReleaseTimer();
    isPreviewing.value = true;
    sliderValue.value = clamp(toNumber(value), 0, 100);
  }

  function handleProgressChange(value: number | number[]) {
    const percent = clamp(toNumber(value), 0, 100);
    sliderValue.value = percent;
    if (progressDisabled.value) {
      isPreviewing.value = false;
      return;
    }
    const positionMs = Math.floor((percent / 100) * durationMs.value);
    args.onSeek(positionMs);
    releasePreviewSoon();
  }

  watch(
    progressPercent,
    (newVal) => {
      if (!isPreviewing.value) sliderValue.value = newVal;
    },
    { immediate: true }
  );

  watch(progressDisabled, (disabled) => {
    if (disabled) {
      clearReleaseTimer();
      isPreviewing.value = false;
      sliderValue.value = 0;
    }
  });

  onScopeDispose(clearReleaseTimer);

  return {
    sliderValue,
    progressDisabled,
    currentTimeDisplay,
    durationDisplay,
    handleProgressInput,
    handleProgressChange,
  };
}

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "@/stores/playerStore";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";
import { formatDuration } from "@/utils/songUtils";

withDefaults(
  defineProps<{
    /** bar：播放栏布局，右侧是「剩余/总时长」切换键；
     *  immersive：沉浸布局，右侧固定显示总时长。 */
    variant?: "bar" | "immersive";
  }>(),
  { variant: "bar" }
);

const emit = defineEmits<{ seek: [positionMs: number] }>();

const { t } = useI18n();
// 直接读 store 而不是走父组件 props：currentPlayTime 每 250ms 变化一次，
// 若经父组件中转，整棵父树都会跟着以 4Hz 重渲染。这个叶子组件把
// 时间显示、滑块的更新范围封在自身里。
const playerStore = usePlayerStore();
const showRemainingTime = ref(false);

const {
  sliderValue,
  progressDisabled,
  currentTimeDisplay,
  durationDisplay,
  handleProgressInput,
  handleProgressChange,
} = usePlaybackProgressSlider({
  currentTime: () => playerStore.currentPlayTime,
  duration: () => playerStore.currentTrackDuration,
  hasTrack: () => playerStore.hasCurrentTrack,
  onSeek: (positionMs) => emit("seek", positionMs),
});

const remainingTimeDisplay = computed(
  () =>
    `-${formatDuration(Math.max(0, playerStore.currentTrackDuration - playerStore.currentPlayTime))}`
);
</script>

<template>
  <!-- 根类名随变体切换：bar 用 .player-progress、immersive 用 .immersive-progress，
       样式与原先各自所在组件里的同名块一一对应。 -->
  <div
    class="playback-progress"
    :class="variant === 'bar' ? 'player-progress' : 'immersive-progress'"
  >
    <span class="time-display">{{ currentTimeDisplay }}</span>
    <el-slider
      v-model="sliderValue"
      :max="100"
      :min="0"
      :step="0.1"
      :show-tooltip="false"
      :disabled="progressDisabled"
      class="progress-slider"
      @input="handleProgressInput"
      @change="handleProgressChange"
    />
    <button
      v-if="variant === 'bar'"
      type="button"
      class="time-display time-display-toggle"
      :aria-label="t('playerBar.toggleRemainingTime')"
      @click="showRemainingTime = !showRemainingTime"
    >
      {{ showRemainingTime ? remainingTimeDisplay : durationDisplay }}
    </button>
    <span v-else class="time-display">{{ durationDisplay }}</span>
  </div>
</template>

<style scoped>
/* ---------- bar 变体：播放栏 ----------
   规则从 PlayerBar.css 原样搬来。scoped 只作用于本组件模板元素，
   el-slider 内部节点必须走 :deep()。 */
.player-progress {
  width: 100%;
  min-width: 0;
  max-width: 560px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-progress .time-display {
  font-size: 11px;
  min-width: 38px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.player-progress .time-display-toggle {
  padding: 2px 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}

.player-progress .time-display-toggle:hover,
.player-progress .time-display-toggle:focus-visible {
  color: var(--el-color-primary);
  outline: 2px solid color-mix(in srgb, var(--el-color-primary) 36%, transparent);
  outline-offset: 1px;
}

.player-progress .progress-slider {
  flex: 1;
  height: 20px;
}

.player-progress :deep(.el-slider__runway) {
  height: 3px;
  background: var(--app-slider-track-bg);
  border-radius: var(--app-radius-full, 9999px);
  transition:
    height 0.2s ease,
    background-color 0.2s ease;
}

.player-progress :deep(.el-slider__bar) {
  height: 100%;
  border-radius: var(--app-radius-full, 9999px);
  background: var(--app-slider-fill-bg);
}

.player-progress :deep(.el-slider__button-wrapper) {
  top: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
}

.player-progress :deep(.el-slider__button) {
  width: var(--app-slider-thumb-size);
  height: var(--app-slider-thumb-size);
  box-sizing: border-box;
  border: 1px solid var(--app-slider-thumb-border);
  background: var(--app-slider-thumb-bg);
  box-shadow: var(--app-slider-thumb-shadow);
  opacity: 1;
  transition:
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.18s ease;
}

.player-progress:hover :deep(.el-slider__runway) {
  height: 4px;
}

.player-progress:hover :deep(.el-slider__button),
.player-progress :deep(.el-slider__button:hover),
.player-progress :deep(.el-slider__button.dragging) {
  transform: scale(1.18);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.18),
    0 0 0 2px color-mix(in srgb, var(--el-color-primary) 18%, transparent);
}

/* ---------- immersive 变体：沉浸视图 ----------
   规则从 ImmersiveView.css 原样搬来。色板变量（--immersive-*）定义在
   .immersive-view 上，作为祖先正常级联到本组件。 */
.immersive-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  width: 100%;
  max-width: var(--immersive-cover-size);
}

.immersive-progress .time-display {
  font-size: 11px;
  min-width: 36px;
  color: var(--immersive-text-muted);
  font-variant-numeric: tabular-nums;
}

.immersive-progress .progress-slider {
  flex: 1;
}

.immersive-progress .progress-slider :deep(.el-slider__runway) {
  height: 3px;
  background-color: var(--immersive-progress-track);
  border-radius: var(--app-radius-full, 9999px);
  transition:
    height 0.2s ease,
    background-color 0.2s ease;
}

.immersive-progress .progress-slider :deep(.el-slider__bar) {
  height: 100%;
  background: color-mix(in srgb, var(--immersive-accent) 88%, #fff);
  border-radius: var(--app-radius-full, 9999px);
}

.immersive-progress .progress-slider :deep(.el-slider__button-wrapper) {
  top: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
}

.immersive-progress .progress-slider :deep(.el-slider__button) {
  width: var(--app-slider-thumb-size);
  height: var(--app-slider-thumb-size);
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 48%, #fff);
  background: var(--immersive-accent);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.24),
    0 0 0 1px rgba(255, 255, 255, 0.18);
  opacity: 1;
  transition:
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.18s ease;
}

.immersive-progress .progress-slider:hover :deep(.el-slider__runway) {
  height: 4px;
  background-color: color-mix(in srgb, var(--immersive-text-primary) 30%, transparent);
}

.immersive-progress .progress-slider:hover :deep(.el-slider__button),
.immersive-progress .progress-slider :deep(.el-slider__button:hover),
.immersive-progress .progress-slider :deep(.el-slider__button.dragging) {
  transform: scale(1.18);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.28),
    0 0 0 2px color-mix(in srgb, var(--el-color-primary) 28%, transparent);
}

/* ---------- 响应式 ---------- */
@media (max-width: 840px) {
  .player-progress {
    max-width: 420px;
  }
}

@media (max-width: 780px) {
  .player-progress {
    min-width: 0;
    gap: 6px;
  }

  .player-progress .time-display {
    min-width: 32px;
  }
}

@media (max-width: 768px) {
  .player-progress .time-display {
    min-width: 28px;
  }
}

/* immersive 变体的响应式规则从 ImmersiveView.css 原样搬来 */
@media (max-height: 720px) {
  .immersive-progress {
    margin-top: 2px;
  }
}

@media (max-width: 720px) and (max-height: 720px) {
  .immersive-progress {
    margin-top: 8px;
  }
}
</style>

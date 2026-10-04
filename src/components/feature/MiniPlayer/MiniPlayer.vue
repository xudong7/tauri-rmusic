<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChatLineSquare, Close, Loading, ScaleToOriginal } from "@element-plus/icons-vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import PauseIcon from "@/components/base/icons/PauseIcon.vue";
import QueueIcon from "@/components/base/icons/QueueIcon.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { STORAGE_KEY_THEME } from "@/constants";
import { playModeIcon, playModeLabelKey } from "@/utils/playModeUtils";
import { useMiniPlayerPlayback } from "@/composables/useMiniPlayerPlayback";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";

const { t } = useI18n();

const {
  track,
  coverUrl,
  isPlaying,
  phase,
  durationMs,
  positionMs,
  playMode,
  isLyricsOverlayOpen,
  togglePlay,
  togglePlayMode,
  toggleLyrics,
  restoreMain,
  openQueue,
  seekTo,
} = useMiniPlayerPlayback();

const isLoading = computed(() => phase.value !== "idle");
const hasTrack = computed(() => track.value !== null);
const coverTitle = computed(() =>
  isPlaying.value ? t("miniPlayer.pause") : t("miniPlayer.play")
);
const playModeTooltip = computed(() => t(playModeLabelKey(playMode.value)));
const modeIcon = computed(() => playModeIcon(playMode.value));

const { sliderValue, progressDisabled, handleProgressInput, handleProgressChange } =
  usePlaybackProgressSlider({
    currentTime: () => positionMs.value,
    duration: () => durationMs.value,
    hasTrack: () => hasTrack.value,
    onSeek: (targetMs) => seekTo(targetMs),
  });

const dragging = ref(false);

function percentFromPointer(event: PointerEvent): number {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  return Math.min(100, Math.max(0, percent));
}

function handlePointerDown(event: PointerEvent) {
  if (progressDisabled.value || event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging.value = true;
  handleProgressInput(percentFromPointer(event));
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  handleProgressInput(percentFromPointer(event));
}

function handlePointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  handleProgressChange(percentFromPointer(event));
}

/** 键盘左右键步进：滑块可聚焦，不依赖指针精度 */
function handleProgressKeydown(event: KeyboardEvent) {
  if (progressDisabled.value) return;
  const step = event.shiftKey ? 10 : 5;
  let target = sliderValue.value;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    target = Math.min(100, target + step);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    target = Math.max(0, target - step);
  } else {
    return;
  }
  event.preventDefault();
  handleProgressInput(target);
  handleProgressChange(target);
}

async function closeMiniPlayer() {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    console.error("关闭迷你播放器失败:", error);
  }
}

/** 独立 webview 不经过 themeStore；直接按存储的主题给根元素打类 */
function applyTheme() {
  const mode = localStorage.getItem(STORAGE_KEY_THEME);
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.classList.toggle("theme-warm", mode === "warm");
}

function handleStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY_THEME) applyTheme();
}

onMounted(() => {
  applyTheme();
  window.addEventListener("storage", handleStorage);
});

onUnmounted(() => {
  window.removeEventListener("storage", handleStorage);
});
</script>

<template>
  <div class="mini-player">
    <div class="mini-player__bar" data-tauri-drag-region>
      <div class="mini-player__window-controls">
        <button
          type="button"
          class="mini-player__window-button mini-player__window-button--close"
          :title="t('miniPlayer.close')"
          :aria-label="t('miniPlayer.close')"
          @click="closeMiniPlayer"
        >
          <el-icon><Close /></el-icon>
        </button>
        <button
          type="button"
          class="mini-player__window-button"
          :title="t('miniPlayer.restoreMain')"
          :aria-label="t('miniPlayer.restoreMain')"
          @click="restoreMain"
        >
          <el-icon><ScaleToOriginal /></el-icon>
        </button>
      </div>

      <button
        type="button"
        class="mini-player__cover"
        :title="coverTitle"
        :aria-label="coverTitle"
        :disabled="!hasTrack"
        @click="togglePlay"
      >
        <CoverImage
          :src="coverUrl"
          :alt="track?.title ?? ''"
          :size="40"
          :radius="6"
          :lazy="false"
        />
        <span
          class="mini-player__cover-overlay"
          :class="{ 'is-loading': isLoading, 'is-visible': !isPlaying }"
        >
          <el-icon v-if="isLoading" class="mini-player__spinner"><Loading /></el-icon>
          <PauseIcon v-else-if="isPlaying" class="mini-player__cover-icon" />
          <PlayIcon v-else class="mini-player__cover-icon" />
        </span>
      </button>

      <div class="mini-player__info" data-tauri-drag-region>
        <p class="mini-player__title" data-tauri-drag-region>
          {{ track?.title ?? t("miniPlayer.empty") }}
        </p>
        <p v-if="track" class="mini-player__artist" data-tauri-drag-region>
          {{ track.artist }}
        </p>
      </div>

      <div class="mini-player__actions">
        <button
          type="button"
          class="mini-player__action"
          :class="{ 'is-active': isLyricsOverlayOpen }"
          :title="t('miniPlayer.lyrics')"
          :aria-label="t('miniPlayer.lyrics')"
          :aria-pressed="isLyricsOverlayOpen"
          @click="toggleLyrics"
        >
          <el-icon><ChatLineSquare /></el-icon>
        </button>
        <button
          type="button"
          class="mini-player__action"
          :title="playModeTooltip"
          :aria-label="playModeTooltip"
          @click="togglePlayMode"
        >
          <el-icon><component :is="modeIcon" /></el-icon>
        </button>
        <button
          type="button"
          class="mini-player__action"
          :title="t('playerBar.queue')"
          :aria-label="t('playerBar.queue')"
          @click="openQueue"
        >
          <el-icon><QueueIcon /></el-icon>
        </button>
      </div>

      <div
        class="mini-player__progress"
        :class="{ 'is-disabled': progressDisabled, 'is-dragging': dragging }"
        role="slider"
        tabindex="0"
        :aria-label="t('miniPlayer.seek')"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(sliderValue)"
        :aria-disabled="progressDisabled"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @keydown="handleProgressKeydown"
      >
        <div class="mini-player__progress-fill" :style="{ width: `${sliderValue}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped src="./MiniPlayer.css" />

<!-- 迷你播放器窗的 html/body 必须透明，否则窗口的透明背景上会盖一层默认白 -->
<style>
html.mini-player-window,
html.mini-player-window body {
  background: transparent !important;
  overflow: hidden;
}

/* 固定尺寸窗口：内容不许滚动，也不许出现文本选择光标 */
html.mini-player-window #app {
  overflow: hidden;
}
</style>

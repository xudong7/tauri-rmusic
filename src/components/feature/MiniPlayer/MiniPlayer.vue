<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChatLineSquare, Close, Loading, ScaleToOriginal } from "@element-plus/icons-vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import PauseIcon from "@/components/base/icons/PauseIcon.vue";
import SkipPreviousIcon from "@/components/base/icons/SkipPreviousIcon.vue";
import SkipNextIcon from "@/components/base/icons/SkipNextIcon.vue";
import QueueIcon from "@/components/base/icons/QueueIcon.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { STORAGE_KEY_THEME } from "@/constants";
import { playModeIcon, playModeLabelKey } from "@/utils/playModeUtils";
import { useMiniPlayerPlayback } from "@/composables/useMiniPlayerPlayback";
import { useMiniPlayerWindowLayout } from "@/composables/useMiniPlayerWindowLayout";
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
  previous,
  next,
  togglePlayMode,
  toggleLyrics,
  restoreMain,
  openQueue,
  seekTo,
} = useMiniPlayerPlayback();

const { isCoverExpanded, toggleCoverExpanded, syncWindowSize } =
  useMiniPlayerWindowLayout();

/**
 * 大图的可见性比窗口尺寸慢半拍：
 * - 展开：先把窗口撑开，下一帧再淡入，否则大图会被窗口边界裁一刀；
 * - 收起：先淡出，等动画结束再把窗口缩回去（延迟在后端的尺寸命令之前，
 *   由 useMiniPlayerWindowLayout 负责）。
 */
const isCoverVisible = ref(false);
watch(
  isCoverExpanded,
  (expanded) => {
    if (!expanded) {
      isCoverVisible.value = false;
      return;
    }
    requestAnimationFrame(() => {
      isCoverVisible.value = true;
    });
  },
  { immediate: true }
);

const isLoading = computed(() => phase.value !== "idle");
const hasTrack = computed(() => track.value !== null);
const coverActionTitle = computed(() =>
  isCoverExpanded.value ? t("miniPlayer.collapseCover") : t("miniPlayer.expandCover")
);
const playTitle = computed(() =>
  isPlaying.value ? t("playerBar.pause") : t("playerBar.play")
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
  // window-state 恢复出来的尺寸可能和上一次的展开态不一致，对齐一次
  void syncWindowSize();
});

onUnmounted(() => {
  window.removeEventListener("storage", handleStorage);
});
</script>

<template>
  <div class="mini-player">
    <!-- 大图与迷你条同属一张卡片：圆角、底色、投影都由 card 统一收口，
         展开时两者之间不会有任何缝隙或色差 -->
    <div class="mini-player__card">
      <!-- 大图只作展示与拖动：展开/收起统一由小封面决定，点大图不该把窗口收掉。
           内层图片必须 pointer-events: none，否则事件落在 <img> 上，拖不动。 -->
      <div
        class="mini-player__cover-large"
        :class="{ 'is-visible': isCoverVisible }"
        data-tauri-drag-region
      >
        <CoverImage
          :src="coverUrl"
          :alt="track?.title ?? ''"
          :fluid="true"
          :radius="0"
          :lazy="false"
        />
      </div>

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
          :title="coverActionTitle"
          :aria-label="coverActionTitle"
          :aria-expanded="isCoverExpanded"
          @click="toggleCoverExpanded"
        >
          <CoverImage
            :src="coverUrl"
            :alt="track?.title ?? ''"
            :size="40"
            :radius="6"
            :lazy="false"
          />
        </button>

        <div class="mini-player__info" data-tauri-drag-region>
          <div class="mini-player__text" data-tauri-drag-region>
            <p class="mini-player__title" data-tauri-drag-region>
              {{ track?.title ?? t("miniPlayer.empty") }}
            </p>
            <p v-if="track" class="mini-player__artist" data-tauri-drag-region>
              {{ track.artist }}
            </p>
          </div>

          <!-- 悬停/聚焦歌曲信息时替换为播放控制：默认藏起来，避免迷你条太挤。
             容器本身仍是拖动区，按钮不是——信息区悬停后也能拖窗。 -->
          <div class="mini-player__transport" data-tauri-drag-region>
            <button
              type="button"
              class="mini-player__transport-button"
              :disabled="!hasTrack"
              :title="t('playerBar.previous')"
              :aria-label="t('playerBar.previous')"
              @click="previous"
            >
              <el-icon><SkipPreviousIcon /></el-icon>
            </button>
            <button
              type="button"
              class="mini-player__transport-button mini-player__transport-button--play"
              :disabled="!hasTrack"
              :title="playTitle"
              :aria-label="playTitle"
              @click="togglePlay"
            >
              <el-icon v-if="isLoading" class="mini-player__spinner"><Loading /></el-icon>
              <PauseIcon v-else-if="isPlaying" />
              <PlayIcon v-else />
            </button>
            <button
              type="button"
              class="mini-player__transport-button"
              :disabled="!hasTrack"
              :title="t('playerBar.next')"
              :aria-label="t('playerBar.next')"
              @click="next"
            >
              <el-icon><SkipNextIcon /></el-icon>
            </button>
          </div>
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

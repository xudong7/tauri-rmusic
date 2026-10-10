<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Close, Loading, ScaleToOriginal } from "@element-plus/icons-vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import PauseIcon from "@/components/base/icons/PauseIcon.vue";
import SkipPreviousIcon from "@/components/base/icons/SkipPreviousIcon.vue";
import SkipNextIcon from "@/components/base/icons/SkipNextIcon.vue";
import QueueIcon from "@/components/base/icons/QueueIcon.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import MiniPlayerQueue from "./MiniPlayerQueue.vue";
import MiniPlayerLyrics from "./MiniPlayerLyrics.vue";
import { STORAGE_KEY_THEME } from "@/constants";
import { playModeIcon, playModeLabelKey } from "@/utils/playModeUtils";
import { useMiniPlayerPlayback } from "@/composables/useMiniPlayerPlayback";
import { useMiniPlayerLyrics } from "@/composables/useMiniPlayerLyrics";
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
  queueRows,
  queueDefaultDirectory,
  togglePlay,
  previous,
  next,
  togglePlayMode,
  restoreMain,
  playQueueIndex,
  clearQueue,
  requestQueue,
  seekTo,
} = useMiniPlayerPlayback();

const { layout, toggleTop, toggleQueue, syncWindowSize } = useMiniPlayerWindowLayout();

const isLoading = computed(() => phase.value !== "idle");
const hasTrack = computed(() => track.value !== null);
const isCoverExpanded = computed(() => layout.value.top === "cover");
const isLyricsOpen = computed(() => layout.value.top === "lyrics");
const isQueueOpen = computed(() => layout.value.queue);

// 窗内歌词：与封面共用上方面板，只在它打开时加载
const {
  lines: lyricLines,
  loading: lyricsLoading,
  unavailable: lyricsUnavailable,
  activeIndex: lyricActiveIndex,
} = useMiniPlayerLyrics({ track, positionMs, isActive: isLyricsOpen });

// 队列面板一打开就主动索取一次：ready 握手可能因 HMR / 主窗重挂载而错过，
// 只等主窗推送的话面板会一直空着。immediate 兼顾「上次退出时队列是开着的」。
watch(
  isQueueOpen,
  (open) => {
    if (open) requestQueue();
  },
  { immediate: true }
);
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
    <!-- 面板与迷你条同属一张卡片：圆角、底色、投影都由 card 统一收口，
         展开时两者之间不会有任何缝隙或色差 -->
    <div class="mini-player__card">
      <!-- 大图只作展示与拖动：展开/收起统一由小封面决定，点大图不该把窗口收掉。
           内层图片必须 pointer-events: none，否则事件落在 <img> 上，拖不动。 -->
      <div v-if="isCoverExpanded" class="mini-player__cover-large" data-tauri-drag-region>
        <CoverImage
          :src="coverUrl"
          :alt="track?.title ?? ''"
          :fluid="true"
          :radius="0"
          :lazy="false"
        />
      </div>

      <!-- 歌词与封面共用迷你条上方这块位置（互斥） -->
      <MiniPlayerLyrics
        v-else-if="isLyricsOpen"
        :lines="lyricLines"
        :active-index="lyricActiveIndex"
        :loading="lyricsLoading"
        :unavailable="lyricsUnavailable"
        @seek="seekTo"
      />

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
          @click="toggleTop('cover')"
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
          <!-- 用「词」字当图标：参考图里就是这个字形，比聊天框图标一眼能认 -->
          <button
            type="button"
            class="mini-player__action mini-player__action--lyrics"
            :class="{ 'is-active': isLyricsOpen }"
            :title="t('miniPlayer.lyrics')"
            :aria-label="t('miniPlayer.lyrics')"
            :aria-pressed="isLyricsOpen"
            @click="toggleTop('lyrics')"
          >
            <span class="mini-player__lyrics-glyph" aria-hidden="true">词</span>
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
            :class="{ 'is-active': isQueueOpen }"
            :title="t('playerBar.queue')"
            :aria-label="t('playerBar.queue')"
            :aria-pressed="isQueueOpen"
            @click="toggleQueue"
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

      <!-- 队列长在迷你条下方：与封面（上方）互不影响，可以同时展开 -->
      <MiniPlayerQueue
        v-if="isQueueOpen"
        :items="queueRows"
        :is-playing="isPlaying"
        :default-directory="queueDefaultDirectory"
        @play="playQueueIndex"
        @clear="clearQueue"
      />
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

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { ElScrollbar } from "element-plus";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import type { SongInfo, MusicFile } from "@/types/model";
import { getSongLyric } from "@/api/commands/netease";
import { loadLocalLyric as loadLocalLyricText } from "@/api/commands/file";
import { formatDuration } from "@/utils/songUtils";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import {
  findLyricIndex,
  getCachedLyric,
  parseLyric,
  setCachedLyric,
  type LyricLine,
} from "@/utils/lyrics";

const { t } = useI18n();

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  currentTime?: number; // 从父组件传入的当前播放时间
}>();

const emit = defineEmits<{
  seek: [positionMs: number];
}>();

const playerStore = usePlayerStore();
const localStore = useLocalMusicStore();

watch(
  () => props.currentTime,
  (newTime) => {
    if (newTime !== undefined && playerStore.isLoadingSong === false) {
      currentLyricTime.value = newTime;
      updateCurrentLine();
    }
  }
);

const lyricData = ref<LyricLine[]>([]);
const loading = ref(false);
const currentIndex = ref(-1);
/** 占位行（暂无歌词 / 加载失败）不可点击跳转 */
const lyricUnavailable = ref(false);
const lyricScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
const currentLyricTime = ref(0);
let lyricUpdateInterval: number | null = null;
let lyricLoadRequestId = 0;
let lyricScrollRequestId = 0;

const lyricSource = computed(() => {
  if (props.currentSong) return { type: "online" as const, song: props.currentSong };
  if (props.currentMusic) return { type: "local" as const, music: props.currentMusic };
  return null;
});

onMounted(() => {
  if (props.currentTime !== undefined) {
    currentLyricTime.value = props.currentTime;
    updateCurrentLine();
  }
});

watch(
  () => props.isPlaying,
  (isPlaying) => {
    if (isPlaying) {
      startLyricUpdate();
    } else {
      stopLyricUpdate();
    }
  },
  { immediate: true }
);

function startLyricUpdate() {
  if (props.currentTime !== undefined) {
    currentLyricTime.value = props.currentTime;
    updateCurrentLine();
    return;
  }

  stopLyricUpdate();

  lyricUpdateInterval = window.setInterval(() => {
    if (props.currentTime !== undefined) {
      currentLyricTime.value = props.currentTime;
    } else currentLyricTime.value += 200;
    updateCurrentLine();
  }, 200);
}

function stopLyricUpdate() {
  if (lyricUpdateInterval !== null) {
    clearInterval(lyricUpdateInterval);
    lyricUpdateInterval = null;
  }
}

async function loadLyric(song: SongInfo) {
  if (!song || !song.file_hash) return;

  const cacheKey = `online:${song.id}`;
  const cached = getCachedLyric(cacheKey);
  if (cached) {
    lyricData.value = cached;
    lyricUnavailable.value = false;
    return;
  }

  const requestId = ++lyricLoadRequestId;
  loading.value = true;
  lyricData.value = [];

  try {
    const lyricContent = await getSongLyric({
      id: song.id,
    });

    if (lyricContent) {
      const parsed = parseLyric(lyricContent);
      if (requestId !== lyricLoadRequestId) return;
      setCachedLyric(cacheKey, parsed);
      lyricData.value = parsed;
      lyricUnavailable.value = false;
    } else {
      if (requestId !== lyricLoadRequestId) return;
      lyricData.value = [{ time: 0, text: t("lyric.noLyric") }];
      lyricUnavailable.value = true;
    }
  } catch (error) {
    if (requestId !== lyricLoadRequestId) return;
    console.error("加载歌词失败:", error);
    lyricData.value = [{ time: 0, text: t("lyric.loadFailed") }];
    lyricUnavailable.value = true;
  } finally {
    if (requestId === lyricLoadRequestId) loading.value = false;
  }
}

async function loadLocalLyric(music: MusicFile) {
  if (!music || !music.file_name) return;

  const cacheKey = `local:${music.file_name}`;
  const cached = getCachedLyric(cacheKey);
  if (cached) {
    lyricData.value = cached;
    lyricUnavailable.value = false;
    return;
  }

  const requestId = ++lyricLoadRequestId;
  loading.value = true;
  lyricData.value = [];
  try {
    const lyricContent = await loadLocalLyricText({
      fileName: music.file_name,
      defaultDirectory: localStore.getDefaultDirectory(),
    });

    if (lyricContent) {
      const parsed = parseLyric(lyricContent);
      if (requestId !== lyricLoadRequestId) return;
      setCachedLyric(cacheKey, parsed);
      lyricData.value = parsed;
      lyricUnavailable.value = false;
    } else {
      if (requestId !== lyricLoadRequestId) return;
      lyricData.value = [{ time: 0, text: t("lyric.noLyric") }];
      lyricUnavailable.value = true;
    }
  } catch (error) {
    if (requestId !== lyricLoadRequestId) return;
    console.error("加载本地歌词失败:", error);
    lyricData.value = [{ time: 0, text: t("lyric.loadFailed") }];
    lyricUnavailable.value = true;
  } finally {
    if (requestId === lyricLoadRequestId) loading.value = false;
  }
}

/** 点击歌词行跳转到该行时间点 */
function seekToLine(line: LyricLine) {
  if (lyricUnavailable.value) return;
  emit("seek", line.time);
}

function updateCurrentLine() {
  if (lyricData.value.length === 0) return;

  const time = currentLyricTime.value;
  const newIndex = findLyricIndex(lyricData.value, time);

  if (newIndex !== currentIndex.value) {
    currentIndex.value = newIndex;
    void scrollToCurrentLine(++lyricScrollRequestId);
  }
}

async function scrollToCurrentLine(requestId: number) {
  await nextTick();
  if (requestId !== lyricScrollRequestId) return;
  if (lyricScrollRef.value && currentIndex.value >= 0) {
    const container = lyricScrollRef.value.$el;
    const activeItem = container.querySelector(".active-lyric");

    if (activeItem) {
      const containerHeight = container.clientHeight;
      const itemTop = activeItem.offsetTop;
      const itemHeight = activeItem.clientHeight;

      scrollLyricsTo(lyricScrollRef.value, itemTop - containerHeight / 2 + itemHeight);
    }
  }
}

/** 当前滚动动画的序号：新目标直接接管，从当前位置接着走 */
let lyricScrollAnimationId = 0;

/**
 * 平滑滚动到指定位置。
 *
 * 自己用 rAF 驱动而不是交给 scroll-behavior: smooth：原生时长不可调，
 * 切行偏快；这里按距离给时长（近处干脆、远处从容）并走减速曲线，接得丝滑。
 * 新目标会打断上一段动画，从当前位置重新出发。
 */
function scrollLyricsTo(
  scrollbar: { setScrollTop: (value: number) => void; $el: HTMLElement },
  target: number
) {
  const container = scrollbar.$el;
  const start = container.scrollTop;
  const distance = target - start;
  const animationId = ++lyricScrollAnimationId;

  if (Math.abs(distance) < 1) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scrollbar.setScrollTop(target);
    return;
  }

  const duration = Math.min(900, 300 + Math.abs(distance) * 0.5);
  const startTime = performance.now();

  const step = (now: number) => {
    if (animationId !== lyricScrollAnimationId) return;
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - progress) ** 3;
    scrollbar.setScrollTop(start + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

watch(
  lyricSource,
  async (source) => {
    currentLyricTime.value = 0;
    currentIndex.value = -1;
    lyricLoadRequestId++;
    lyricScrollRequestId++;

    if (!source) {
      lyricData.value = [];
    } else if (source.type === "online") {
      await loadLyric(source.song);
    } else {
      await loadLocalLyric(source.music);
    }

    if (props.isPlaying) {
      startLyricUpdate();
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopLyricUpdate();
});

const lyricContainerClass = computed(() => {
  return {
    "lyric-container": true,
    "is-playing": props.isPlaying,
  };
});
</script>

<template>
  <div :class="lyricContainerClass">
    <div v-if="loading" class="lyric-loading">{{ t("lyric.loading") }}</div>
    <div v-else-if="!lyricData.length" class="lyric-empty">{{ t("lyric.noLyric") }}</div>
    <el-scrollbar ref="lyricScrollRef" height="100%" view-class="lyric-scroll-view">
      <div class="lyric-lines">
        <!-- 顶部空白，确保第一行歌词可以滚动到中间 -->
        <div class="lyric-line lyric-placeholder"></div>

        <!-- 点击歌词行跳到该行时间点；hover 时左侧浮出「播放 + 时间」胶囊，
             与参考图一致 -->
        <component
          :is="lyricUnavailable ? 'div' : 'button'"
          v-for="(line, index) in lyricData"
          :key="index"
          :type="lyricUnavailable ? undefined : 'button'"
          class="lyric-line"
          :class="{
            'active-lyric': index === currentIndex,
            'is-seekable': !lyricUnavailable,
          }"
          :aria-label="
            lyricUnavailable
              ? undefined
              : t('lyric.seekTo', { time: formatDuration(line.time) })
          "
          @click="seekToLine(line)"
        >
          <span v-if="!lyricUnavailable" class="lyric-seek-hint" aria-hidden="true">
            <PlayIcon class="lyric-seek-icon" />
            <span class="lyric-seek-time">{{ formatDuration(line.time) }}</span>
          </span>
          <span class="lyric-line-text">{{ line.text }}</span>
        </component>

        <!-- 底部空白，确保最后一行歌词可以滚动到中间 -->
        <div class="lyric-line lyric-placeholder"></div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./LyricView.css" />

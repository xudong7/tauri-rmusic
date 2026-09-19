<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { ElScrollbar } from "element-plus";
import type { SongInfo, MusicFile } from "@/types/model";
import { getSongLyric } from "@/api/commands/netease";
import { loadLocalLyric as loadLocalLyricText } from "@/api/commands/file";
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
    } else {
      if (requestId !== lyricLoadRequestId) return;
      lyricData.value = [{ time: 0, text: t("lyric.noLyric") }];
    }
  } catch (error) {
    if (requestId !== lyricLoadRequestId) return;
    console.error("加载歌词失败:", error);
    lyricData.value = [{ time: 0, text: t("lyric.loadFailed") }];
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
    } else {
      if (requestId !== lyricLoadRequestId) return;
      lyricData.value = [{ time: 0, text: t("lyric.noLyric") }];
    }
  } catch (error) {
    if (requestId !== lyricLoadRequestId) return;
    console.error("加载本地歌词失败:", error);
    lyricData.value = [{ time: 0, text: t("lyric.loadFailed") }];
  } finally {
    if (requestId === lyricLoadRequestId) loading.value = false;
  }
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

      lyricScrollRef.value.setScrollTop(itemTop - containerHeight / 2 + itemHeight);
    }
  }
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

        <div
          v-for="(line, index) in lyricData"
          :key="index"
          class="lyric-line"
          :class="{ 'active-lyric': index === currentIndex }"
        >
          {{ line.text }}
        </div>

        <!-- 底部空白，确保最后一行歌词可以滚动到中间 -->
        <div class="lyric-line lyric-placeholder"></div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./LyricView.css" />

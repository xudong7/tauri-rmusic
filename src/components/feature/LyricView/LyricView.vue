<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
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
} from "@/composables/useLyrics";

const { t } = useI18n();

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
}>();

const playerStore = usePlayerStore();
const localStore = useLocalMusicStore();

// 直接监听 store 里的播放时间（每 250ms 更新一次）。
// 原先走 props.currentTime 中转：时间一变，父组件 ImmersiveView 的整棵
// 渲染树都会跟着以 4Hz 重渲染；这里读 store 只影响本组件，且下面
// 只更新 currentIndex，歌词行没有变化时连本组件都不会重渲染。
watch(
  () => playerStore.currentPlayTime,
  (newTime) => {
    // 切歌加载期间时间会回零，跳过这段避免歌词乱跳
    if (playerStore.isLoadingSong === false) {
      currentLyricTime.value = newTime;
      updateCurrentLine();
    }
  },
  { immediate: true }
);

// 歌词数据
const lyricData = ref<LyricLine[]>([]);
// 加载状态
const loading = ref(false);
// 当前显示的歌词索引
const currentIndex = ref(-1);
// 歌词滚动容器引用
const lyricScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
// 通过状态模拟实现简单的歌词滚动
const currentLyricTime = ref(0);
let lyricLoadRequestId = 0;
let lyricScrollRequestId = 0;

const lyricSource = computed(() => {
  if (props.currentSong) return { type: "online" as const, song: props.currentSong };
  if (props.currentMusic) return { type: "local" as const, music: props.currentMusic };
  return null;
});

// 加载歌词
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
    // 直接获取歌词内容
    const lyricContent = await getSongLyric({
      id: song.id,
    });

    if (lyricContent) {
      // 解析歌词
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

// 加载本地歌词
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
      // 解析歌词
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

// 根据当前播放时间更新显示的歌词
function updateCurrentLine() {
  if (lyricData.value.length === 0) return;

  const time = currentLyricTime.value;
  const newIndex = findLyricIndex(lyricData.value, time);

  // 如果索引变化了，更新并滚动
  if (newIndex !== currentIndex.value) {
    currentIndex.value = newIndex;
    void scrollToCurrentLine(++lyricScrollRequestId);
  }
}

// 滚动到当前歌词行
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

      // 将当前行滚动到中间位置
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

    // 歌词就位后按当前播放时间定位一次（正在播放时时间推进由上面的
    // currentPlayTime watch 驱动，这里只需要对到此刻）
    currentLyricTime.value = playerStore.currentPlayTime;
    updateCurrentLine();
  },
  { immediate: true }
);

// 歌词容器类
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

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ElScrollbar } from "element-plus";
import type { SongInfo, MusicFile } from "../../types/model";
import { useMusicStore } from "@/stores/musicStore";

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  currentTime?: number; // 从父组件传入的当前播放时间
}>();

// 使用 musicStore
const musicStore = useMusicStore();

// 监听当前播放时间变化
watch(
  () => props.currentTime,
  (newTime) => {
    // 使用播放时间更新歌词
    if (newTime !== undefined && props.isPlaying && musicStore.isLoadingSong === false) {
      // 如果有外部传入的时间，直接使用并更新当前行
      currentLyricTime.value = newTime;
      updateCurrentLine();
    }
  }
);

// 歌词数据
const lyricData = ref<Array<{ time: number; text: string }>>([]);
// 加载状态
const loading = ref(false);
// 当前显示的歌词索引
const currentIndex = ref(-1);
// 歌词滚动容器引用
const lyricScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
// 通过状态模拟实现简单的歌词滚动
const currentLyricTime = ref(0);
let lyricUpdateInterval: number | null = null;

// 组件挂载时，初始化播放时间
onMounted(() => {
  // 如果有外部传入的时间，立即同步
  if (props.currentTime !== undefined) {
    currentLyricTime.value = props.currentTime;
    updateCurrentLine();
  }
});

// 监听播放状态
watch(
  () => props.isPlaying,
  (isPlaying) => {
    if (isPlaying) {
      // 开始歌词滚动
      console.log("[歌词] 开始歌词滚动");
      startLyricUpdate();
    } else {
      // 停止模拟歌词滚动
      console.log("[歌词] 停止歌词滚动，播放已暂停");
      stopLyricUpdate();
    }
  },
  { immediate: true }
);

// 开始模拟歌词滚动
function startLyricUpdate() {
  // 清除之前的定时器
  stopLyricUpdate();

  // 如果有外部传入的时间，立即同步
  if (props.currentTime !== undefined) {
    currentLyricTime.value = props.currentTime;
    updateCurrentLine();
  }

  // 开始新的定时器
  lyricUpdateInterval = window.setInterval(() => {
    if (props.currentTime !== undefined) {
      // 使用实际播放时间
      currentLyricTime.value = props.currentTime;
    } else {
      // 回退到模拟方式，但确保增加的时间和更新间隔匹配
      // 使用200ms的更新频率，但每次只增加200ms的播放时间
      currentLyricTime.value += 200;
    }
    updateCurrentLine();
  }, 200); // 更新频率提高到200ms，让滚动更流畅
}

// 停止模拟歌词滚动
function stopLyricUpdate() {
  if (lyricUpdateInterval !== null) {
    clearInterval(lyricUpdateInterval);
    lyricUpdateInterval = null;
  }
}

// 解析LRC歌词
function parseLyric(lrc: string): Array<{ time: number; text: string }> {
  if (!lrc) return [];

  const lines = lrc.split("\n");
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  const result: Array<{ time: number; text: string }> = [];

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseInt(match[3].padEnd(3, "0"));
      const time = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
      const text = line.replace(timeRegex, "").trim();

      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

// 加载歌词
async function loadLyric(song: SongInfo) {
  if (!song || !song.file_hash) return;

  loading.value = true;
  lyricData.value = [];

  try {
    // 直接获取歌词内容
    const lyricContent = await invoke<string>("get_song_lyric", {
      id: song.id,
    });

    if (lyricContent) {
      // 解析歌词
      lyricData.value = parseLyric(lyricContent);
    } else {
      lyricData.value = [{ time: 0, text: "暂无歌词" }];
    }
  } catch (error) {
    console.error("加载歌词失败:", error);
    lyricData.value = [{ time: 0, text: "歌词加载失败" }];
  } finally {
    loading.value = false;
  }
}

// 加载本地歌词
async function loadLocalLyric(music: MusicFile) {
  if (!music || !music.file_name) return;

  loading.value = true;
  lyricData.value = [];
  try {
    const result = await invoke<[string, string]>("load_cover_and_lyric", {
      fileName: music.file_name,
      defaultDirectory: musicStore.getDefaultDirectory(),
    });

    const [_, lyricContent] = result;

    if (lyricContent) {
      // 解析歌词
      lyricData.value = parseLyric(lyricContent as string);
    } else {
      lyricData.value = [{ time: 0, text: "暂无歌词" }];
    }
  } catch (error) {
    console.error("加载本地歌词失败:", error);
    lyricData.value = [{ time: 0, text: "歌词加载失败" }];
  } finally {
    loading.value = false;
  }
}

// 根据当前播放时间更新显示的歌词
function updateCurrentLine() {
  if (lyricData.value.length === 0) return;

  // 找到当前时间对应的歌词行
  const time = currentLyricTime.value;
  let index = lyricData.value.findIndex((item) => item.time > time);

  // 如果没找到或者超过范围，取最后一行
  if (index === -1) {
    index = lyricData.value.length;
  }

  // 当前行是上一行
  const newIndex = index > 0 ? index - 1 : 0;

  // 如果索引变化了，更新并滚动
  if (newIndex !== currentIndex.value) {
    currentIndex.value = newIndex;
    scrollToCurrentLine();
  }
}

// 滚动到当前歌词行
async function scrollToCurrentLine() {
  await nextTick();
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

// 监听当前歌曲变化
watch(
  () => props.currentSong,
  async (newSong) => {
    // 重置当前时间和索引
    currentLyricTime.value = 0;
    currentIndex.value = -1;

    if (newSong) {
      await loadLyric(newSong);
    } else {
      // 如果不是在线歌曲，尝试加载本地歌词
      if (props.currentMusic) {
        await loadLocalLyric(props.currentMusic);
      } else {
        lyricData.value = [];
      }
    }

    // 如果正在播放，启动歌词滚动
    if (props.isPlaying) {
      startLyricUpdate();
    }
  },
  { immediate: true }
);

// 监听本地歌曲变化
watch(
  () => props.currentMusic,
  async (newMusic) => {
    // 只有当没有在线歌曲时才处理本地歌曲
    if (!props.currentSong) {
      // 重置当前时间和索引
      currentLyricTime.value = 0;
      currentIndex.value = -1;

      if (newMusic) {
        await loadLocalLyric(newMusic);
      } else {
        lyricData.value = [];
      }
      // 如果正在播放，启动歌词滚动
      if (props.isPlaying) {
        startLyricUpdate();
      }
    }
  },
  { immediate: true }
);

// 组件卸载时清除定时器
onUnmounted(() => {
  stopLyricUpdate();
});

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
    <div v-if="loading" class="lyric-loading">加载歌词中...</div>
    <div v-else-if="!lyricData.length" class="lyric-empty">暂无歌词</div>
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

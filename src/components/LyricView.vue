<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ElScrollbar } from "element-plus";
import type { SongInfo, MusicFile } from "../types/model";

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  currentTime: number; // 当前播放时间（毫秒）
  isPlaying: boolean;
}>();

// 歌词数据
const lyricData = ref<Array<{ time: number; text: string }>>([]);
// 加载状态
const loading = ref(false);
// 当前显示的歌词索引
const currentIndex = ref(-1);
// 歌词滚动容器引用
const lyricScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null);

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
    // 1. 搜索歌词信息
    const lyricInfo = await invoke("search_lyric", { hash: song.file_hash });

    // 2. 获取歌词内容
    if (lyricInfo && lyricInfo.id && lyricInfo.accesskey) {
      const decodedLyric = await invoke("get_lyric_decoded", {
        id: lyricInfo.id,
        accesskey: lyricInfo.accesskey,
      });

      if (decodedLyric) {
        // 3. 解析歌词
        lyricData.value = parseLyric(decodedLyric as string);
      } else {
        lyricData.value = [{ time: 0, text: "暂无歌词" }];
      }
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
    const [_, lyricContent] = await invoke("load_cover_and_lyric", {
      fileName: music.file_name,
    });

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
  const currentTime = props.currentTime;
  let index = lyricData.value.findIndex((item) => item.time > currentTime);

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
      lyricScrollRef.value.setScrollTop(
        itemTop - containerHeight / 2 + itemHeight
      );
    }
  }
}

// 监听当前歌曲变化
watch(
  () => props.currentSong,
  async (newSong) => {
    if (newSong) {
      await loadLyric(newSong);
      currentIndex.value = -1;
    } else {
      // 如果不是在线歌曲，尝试加载本地歌词
      if (props.currentMusic) {
        await loadLocalLyric(props.currentMusic);
        currentIndex.value = -1;
      } else {
        lyricData.value = [];
        currentIndex.value = -1;
      }
    }
  },
  { immediate: true }
);

// 监听本地歌曲变化
watch(
  () => props.currentMusic,
  async (newMusic) => {
    // 仅当不是在线歌曲时加载本地歌词
    if (newMusic && !props.currentSong) {
      await loadLocalLyric(newMusic);
      currentIndex.value = -1;
    }
  },
  { immediate: true }
);

// 监听播放时间变化
watch(
  () => props.currentTime,
  () => {
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
    <div v-if="loading" class="lyric-loading">加载歌词中...</div>
    <div v-else-if="!lyricData.length" class="lyric-empty">暂无歌词</div>
    <el-scrollbar
      ref="lyricScrollRef"
      height="100%"
      view-class="lyric-scroll-view"
    >
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

<style scoped>
.lyric-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.3s ease;
  padding: 0 10px;
}

.is-playing {
  color: rgba(255, 255, 255, 0.8);
}

.lyric-loading,
.lyric-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.lyric-lines {
  padding: 20px 0;
}

.lyric-line {
  text-align: center;
  margin: 18px 0;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
  padding: 0 20px;
  opacity: 0.7;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transform: scale(0.95);
}

.active-lyric {
  /* color: #fff; */
  color: var(--el-color-primary);
  font-size: 16px;
  font-weight: 500;
  opacity: 1;
  transform: scale(1);
  letter-spacing: 0.5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.lyric-placeholder {
  height: 150px;
  opacity: 0;
}

.lyric-scroll-view {
  scroll-behavior: smooth;
}

/* 优化滚动条样式 */
.lyric-container :deep(.el-scrollbar__bar) {
  opacity: 0.2;
  width: 4px;
}

.lyric-container:hover :deep(.el-scrollbar__bar) {
  opacity: 0.3;
}
</style>

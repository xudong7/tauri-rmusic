<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import HeaderBar from "./components/HeaderBar.vue";
import MusicList from "./components/MusicList.vue";
import OnlineMusicList from "./components/OnlineMusicList.vue";
import PlayerBar from "./components/PlayerBar.vue";
import ImmersiveView from "./components/ImmersiveView.vue";
import type { MusicFile, SongInfo, SearchResult } from "./types/model";
import { ViewMode } from "./types/model";

// 视图模式（本地/在线）
const viewMode = ref<ViewMode>(ViewMode.LOCAL);

// 音乐文件列表
const musicFiles = ref<MusicFile[]>([]);
// 在线音乐列表
const onlineSongs = ref<SongInfo[]>([]);
// 在线音乐总数
const onlineSongsTotal = ref(0);
// 在线搜索是否加载中
const isSearchLoading = ref(false);
// 当前搜索关键词
const searchKeyword = ref("");
// 当前页码
const currentPage = ref(1);
// 每页大小
const pageSize = ref(20);

// 当前选择的目录
const currentDirectory = ref("");
// 当前播放的本地音乐
const currentMusic = ref<MusicFile | null>(null);
// 当前播放的在线音乐
const currentOnlineSong = ref<SongInfo | null>(null);
// 播放状态
const isPlaying = ref(false);
// 当前播放时间（毫秒）
const currentTime = ref(0);
// 定时器ID
let timeUpdateTimer: number | null = null;
// 是否显示沉浸模式
const showImmersiveMode = ref(false);

// 加载音乐文件
async function loadMusicFiles(path: string) {
  try {
    currentDirectory.value = path;
    musicFiles.value = await invoke("scan_files", { path });
  } catch (error) {
    console.error("加载音乐文件失败:", error);
    ElMessage.error(`加载音乐文件失败: ${error}`);
  }
}

// 选择文件夹
async function selectDirectory() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择音乐文件夹",
    });

    if (selected && typeof selected === "string") {
      await loadMusicFiles(selected);
    }
  } catch (error) {
    console.error("选择文件夹失败:", error);
    ElMessage.error(`选择文件夹失败: ${error}`);
  }
}

// 播放本地音乐
async function playMusic(music: MusicFile) {
  try {
    currentMusic.value = music;
    currentOnlineSong.value = null;
    isPlaying.value = true;
    currentTime.value = 0;
    const fullPath = `${currentDirectory.value}/${music.file_name}`;
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: fullPath,
      }),
    });

    // 启动时间更新
    startTimeTracking();
  } catch (error) {
    console.error("播放音乐失败:", error);
    ElMessage.error(`播放音乐失败: ${error}`);
  }
}

// 播放在线音乐
async function playOnlineSong(song: SongInfo) {
  try {
    currentOnlineSong.value = song;
    currentMusic.value = null;
    isPlaying.value = true;
    currentTime.value = 0;

    // 获取播放URL
    const url = await invoke("play_netease_song", { id: song.file_hash });
    if (!url) {
      throw new Error("获取播放URL失败");
    }

    // 播放歌曲
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: url,
      }),
    });

    // 启动时间更新
    startTimeTracking();

    ElMessage.success(`正在播放: ${song.name} - ${song.artists.join(", ")}`);
  } catch (error) {
    console.error("播放在线音乐失败:", error);
    isPlaying.value = false;
    ElMessage.error(`播放在线音乐失败: ${error}`);
  }
}

// 下载在线音乐
async function downloadOnlineSong(song: SongInfo) {
  try {
    ElMessage.info("开始下载歌曲，请稍候...");

    const fileName = await invoke("download_music", {
      songHash: song.file_hash,
      songName: song.name,
      artist: song.artists.join(", "),
    });

    ElMessage.success(`歌曲已下载: ${fileName}`);

    // 如果在本地模式，刷新文件列表
    if (viewMode.value === ViewMode.LOCAL && currentDirectory.value) {
      await loadMusicFiles(currentDirectory.value);
    }
  } catch (error) {
    console.error("下载歌曲失败:", error);
    ElMessage.error(`下载歌曲失败: ${error}`);
  }
}

// 播放下一首或上一首音乐
async function playNextOrPreviousMusic(step: number) {
  // 本地
  if (viewMode.value === ViewMode.LOCAL) {
    const currentIndex = musicFiles.value.findIndex(
      (file) => file.id === currentMusic.value?.id
    );
    const nextIndex = (currentIndex + step) % musicFiles.value.length;
    await playMusic(musicFiles.value[nextIndex]);
  } else {
    // 在线
    const currentIndex = onlineSongs.value.findIndex(
      (song) => song.id === currentOnlineSong.value?.id
    );
    const nextIndex = (currentIndex + step) % onlineSongs.value.length;
    await playOnlineSong(onlineSongs.value[nextIndex]);
  }
}

// 暂停/恢复播放
async function togglePlay() {
  if (isPlaying.value) {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "pause",
      }),
    });

    // 暂停时间更新
    stopTimeTracking();
  } else {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "recovery",
      }),
    });

    // 恢复时间更新
    startTimeTracking();
  }
  isPlaying.value = !isPlaying.value;
}

// 调整音量
async function adjustVolume(volume: number) {
  await invoke("handle_event", {
    event: JSON.stringify({
      action: "volume",
      volume,
    }),
  });
}

// 刷新当前目录
async function refreshCurrentDirectory() {
  if (currentDirectory.value) {
    await loadMusicFiles(currentDirectory.value);
  }
}

// 搜索音乐
async function searchMusic(keyword: string) {
  // 如果是本地模式，执行本地搜索
  if (viewMode.value === ViewMode.LOCAL) {
    // 只留下与搜索关键词相关的音乐文件
    const filteredFiles = musicFiles.value.filter((file) =>
      file.file_name.toLowerCase().includes(keyword.toLowerCase())
    );
    musicFiles.value = filteredFiles;
    if (filteredFiles.length === 0) {
      ElMessage.info("未找到相关歌曲");
    } else {
      ElMessage.success(`找到 ${filteredFiles.length} 首相关歌曲`);
    }
    return;
  }

  // 执行在线搜索
  await searchOnlineMusic(keyword);
}

// 在线搜索音乐
async function searchOnlineMusic(keyword: string, page = 1) {
  try {
    // 如果是第一页，则重置搜索状态
    if (page === 1) {
      onlineSongs.value = [];
      onlineSongsTotal.value = 0;
    }

    searchKeyword.value = keyword;
    currentPage.value = page;
    isSearchLoading.value = true;

    // 调用后端API
    const result = await invoke<SearchResult>("search_songs", {
      keywords: keyword,
      page,
      pagesize: pageSize.value,
    });

    // 如果是第一页，直接赋值；否则追加结果
    if (page === 1) {
      onlineSongs.value = result.songs;
    } else {
      onlineSongs.value = [...onlineSongs.value, ...result.songs];
    }

    onlineSongsTotal.value = result.total;

    if (result.songs.length === 0 && page === 1) {
      ElMessage.info("未找到相关歌曲");
    }
  } catch (error) {
    console.error("在线搜索失败:", error);
    ElMessage.error(`在线搜索失败: ${error}`);
  } finally {
    isSearchLoading.value = false;
  }
}

// 加载更多
function loadMoreResults() {
  if (searchKeyword.value) {
    searchOnlineMusic(searchKeyword.value, currentPage.value + 1);
  }
}

// 切换视图模式
function switchViewMode(mode: ViewMode) {
  viewMode.value = mode;

  // 如果切换到在线模式，清空在线搜索结果
  if (mode === ViewMode.ONLINE) {
    onlineSongs.value = [];
    onlineSongsTotal.value = 0;
  }
}

// 启动时间更新
function startTimeTracking() {
  stopTimeTracking(); // 先停止可能存在的定时器

  const updateInterval = 500; // 每500ms更新一次
  const song = currentOnlineSong.value;

  if (song) {
    timeUpdateTimer = window.setInterval(() => {
      // 增加播放时间
      currentTime.value += updateInterval;

      // 检查是否播放结束
      if (song.duration && currentTime.value >= song.duration) {
        currentTime.value = song.duration;
        isPlaying.value = false;
        stopTimeTracking();
        // TODO: 自动播放下一首
      }
    }, updateInterval);
  }
}

// 停止时间更新
function stopTimeTracking() {
  if (timeUpdateTimer !== null) {
    clearInterval(timeUpdateTimer);
    timeUpdateTimer = null;
  }
}

// 显示沉浸模式
function showImmersive() {
  if (currentOnlineSong.value) {
    showImmersiveMode.value = true;
  }
}

// 关闭沉浸模式
function exitImmersive() {
  showImmersiveMode.value = false;
}

// 初始化加载默认音乐目录
onMounted(async () => {
  try {
    const defaultDir = await invoke("get_default_music_dir");
    if (defaultDir) {
      await loadMusicFiles(defaultDir as string);
    }
  } catch (error) {
    console.error("加载默认目录失败:", error);
  }
});

// 组件卸载时清理定时器
onUnmounted(() => {
  stopTimeTracking();
});
</script>

<template>
  <div class="music-app">
    <!-- 顶部搜索和文件夹选择 -->
    <HeaderBar
      :currentDirectory="currentDirectory"
      :viewMode="viewMode"
      @select-directory="selectDirectory"
      @refresh="refreshCurrentDirectory"
      @search="searchMusic"
      @switch-view="switchViewMode"
    />

    <!-- 主内容区域 - 歌曲列表 -->
    <div class="main-content">
      <!-- 本地音乐列表 -->
      <MusicList
        v-if="viewMode === ViewMode.LOCAL"
        :musicFiles="musicFiles"
        :currentMusic="currentMusic"
        :isPlaying="isPlaying"
        @play="playMusic"
      />

      <!-- 在线音乐列表 -->
      <OnlineMusicList
        v-else
        :onlineSongs="onlineSongs"
        :currentSong="currentOnlineSong"
        :isPlaying="isPlaying"
        :loading="isSearchLoading"
        :totalCount="onlineSongsTotal"
        @play="playOnlineSong"
        @download="downloadOnlineSong"
        @load-more="loadMoreResults"
      />
    </div>

    <!-- 底部播放控制栏 -->
    <PlayerBar
      :currentMusic="currentMusic"
      :currentOnlineSong="currentOnlineSong"
      :isPlaying="isPlaying"
      :currentTime="currentTime"
      @toggle-play="togglePlay"
      @volume-change="adjustVolume"
      @previous="playNextOrPreviousMusic(-1)"
      @next="playNextOrPreviousMusic(1)"
      @show-immersive="showImmersive"
    />

    <!-- 沉浸模式 -->
    <ImmersiveView
      v-if="showImmersiveMode"
      :currentSong="currentOnlineSong"
      :isPlaying="isPlaying"
      :currentTime="currentTime"
      @toggle-play="togglePlay"
      @next="playNextOrPreviousMusic(1)"
      @previous="playNextOrPreviousMusic(-1)"
      @exit="exitImmersive"
    />
  </div>
</template>

<style>
.music-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden; /* 防止出现滑动条 */
}

.main-content {
  flex: 1;
  overflow: hidden; /* 修改为hidden，让子组件控制滚动 */
  padding: 16px;
  box-sizing: border-box; /* 确保padding不会导致超出容器 */
}

body {
  margin: 0;
  padding: 0; /* 确保body没有padding */
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
  overflow: hidden; /* 防止body出现滑动条 */
}

html {
  overflow: hidden; /* 防止html出现滑动条 */
}
</style>

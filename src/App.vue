<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import HeaderBar from "./components/HeaderBar/HeaderBar.vue";
import MusicList from "./components/MusicList/MusicList.vue";
import OnlineMusicList from "./components/OnlineMusicList/OnlineMusicList.vue";
import PlayerBar from "./components/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/ImmersiveView/ImmersiveView.vue";
import type {
  MusicFile,
  SongInfo,
  SearchResult,
  PlaySongResult,
} from "./types/model";
import { ViewMode } from "./types/model";

// 主题设置
const isDarkMode = ref(false);

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
    // 先将播放状态设置为 false，避免在加载过程中触发自动检测下一首机制
    isPlaying.value = false;

    currentMusic.value = music;
    currentOnlineSong.value = null;

    const fullPath = `${currentDirectory.value}/${music.file_name}`;

    // 播放歌曲
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: fullPath,
      }),
    });

    // 短暂延迟后设置播放状态，确保音频引擎已经成功加载
    await new Promise((resolve) => setTimeout(resolve, 100));
    isPlaying.value = true;

    ElMessage.success(`正在播放: ${music.file_name}`);
  } catch (error) {
    console.error("播放音乐失败:", error);
    ElMessage.error(`播放音乐失败: ${error}`);
  }
}

// 播放在线音乐
async function playOnlineSong(song: SongInfo) {
  try {
    // 先将播放状态设置为 false，避免在加载过程中触发自动检测下一首机制
    isPlaying.value = false;

    currentOnlineSong.value = song;
    currentMusic.value = null;

    // 获取播放URL和信息
    const songResult = await invoke<PlaySongResult>("play_netease_song", {
      id: song.file_hash,
      name: song.name,
      artist: song.artists.join(", "),
    });

    // 检查返回结果
    if (!songResult || !songResult.url) {
      throw new Error("获取播放URL失败");
    }

    // 更新歌曲封面
    if (songResult.pic_url) {
      currentOnlineSong.value.pic_url = songResult.pic_url;
    }

    // sleep 2秒，确保歌曲信息更新和资源加载
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 播放歌曲
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: songResult.url,
      }),
    });

    // 所有准备工作完成后，设置播放状态为 true
    isPlaying.value = true;

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
  } else {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "recovery",
      }),
    });
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
    if (!keyword.trim()) {
      refreshCurrentDirectory();
      return;
    }
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
  } else if (mode === ViewMode.LOCAL && currentDirectory.value) {
    // 如果切换到本地模式，自动刷新本地音乐列表
    refreshCurrentDirectory();
  }
}

// 根据当前时间设置主题
function setThemeByTime() {
  const now = new Date();
  const hours = now.getHours();

  // 早上8点到晚上6点为亮色模式，其余为暗色模式
  const shouldBeDark = hours < 8 || hours >= 18;

  if (isDarkMode.value !== shouldBeDark) {
    isDarkMode.value = shouldBeDark;
    applyTheme();
  }
}

// 应用主题
function applyTheme() {
  if (isDarkMode.value) {
    document.documentElement.classList.add("dark");
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    document.body.setAttribute("data-theme", "light");
  }
}

// 切换主题
function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  applyTheme();
}

// 显示沉浸模式
function showImmersive() {
  // 如果有在线歌曲或本地音乐，都可以进入沉浸模式
  if (currentOnlineSong.value || currentMusic.value) {
    showImmersiveMode.value = true;
  }
}

// 关闭沉浸模式
function exitImmersive() {
  showImmersiveMode.value = false;
}

// 处理键盘快捷键
function handleKeyDown(event: KeyboardEvent) {
  // 如果是在输入框中按下快捷键，则不处理
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  switch (event.key) {
    case "ArrowLeft":
      playNextOrPreviousMusic(-1);
      event.preventDefault();
      break;
    case " ":
      togglePlay();
      event.preventDefault();
      break;
    case "ArrowRight":
      playNextOrPreviousMusic(1);
      event.preventDefault();
      break;
  }
}

// 设置监听播放结束的定时器
function setupPlaybackEndDetection() {
  let checkInterval: number | null = null;
  console.log("初始化播放结束检测机制");

  // 监听播放状态变化
  watch(
    isPlaying,
    (playing) => {
      // 如果开始播放，则启动定时器检查是否播放结束
      if (playing) {
        console.log("播放状态变为播放中，开始监听播放结束");

        if (checkInterval !== null) {
          clearInterval(checkInterval);
          console.log("清除旧的检测定时器");
        } // 添加歌曲开始播放的时间戳，用于避免歌曲刚开始播放就检测到结束
        const playStartTime = Date.now();

        checkInterval = window.setInterval(() => {
          // 检查歌曲是否结束，添加3秒保护期，避免刚开始播放就误判为结束
          const currentTime = Date.now();
          const playingTime = currentTime - playStartTime;

          // 只有播放超过3秒后才检查是否结束
          if (playingTime < 3000) {
            return;
          }

          invoke<boolean>("is_sink_empty")
            .then((isEmpty) => {
              if (isEmpty && isPlaying.value) {
                // 添加日志，帮助调试
                console.log("检测到歌曲播放完成，已播放时长(ms):", playingTime);

                // 歌曲已结束，自动播放下一首
                console.log("歌曲播放完成，准备播放下一首");
                isPlaying.value = false;

                if (checkInterval !== null) {
                  clearInterval(checkInterval);
                  checkInterval = null;
                }

                // 自动播放下一首
                playNextOrPreviousMusic(1);
              }
            })
            .catch((error) => {
              console.error("检查播放状态失败:", error);
            });
        }, 1000); // 每秒检查一次
      }
      // 如果停止播放，则清除定时器
      else if (checkInterval !== null) {
        console.log("播放状态变为暂停，清除检测定时器");
        clearInterval(checkInterval);
        checkInterval = null;
      }
    },
    { immediate: true }
  );

  // 组件卸载时清除定时器
  onUnmounted(() => {
    console.log("组件卸载，清除检测定时器");
    if (checkInterval !== null) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  });
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
  // 初始化主题 - 仅启动时根据时间自动设置一次
  setThemeByTime();
  applyTheme();

  // 添加全局键盘事件监听
  window.addEventListener("keydown", handleKeyDown);

  // 设置播放结束检测
  setupPlaybackEndDetection();
});

// 组件卸载时清理事件监听器
onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

// 导出主题相关函数以供组件使用
defineExpose({
  toggleTheme,
  isDarkMode,
});
</script>

<template>
  <div class="music-app" :class="{ 'dark-theme': isDarkMode }">
    <!-- 自定义标题栏 -->
    <!-- <TitleBar :isDarkMode="isDarkMode" /> -->

    <!-- 顶部搜索和文件夹选择 -->
    <HeaderBar
      :currentDirectory="currentDirectory"
      :viewMode="viewMode"
      :isDarkMode="isDarkMode"
      @select-directory="selectDirectory"
      @refresh="refreshCurrentDirectory"
      @search="searchMusic"
      @switch-view="switchViewMode"
      @toggle-theme="toggleTheme"
      @previous-track="playNextOrPreviousMusic(-1)"
      @toggle-play="togglePlay"
      @next-track="playNextOrPreviousMusic(1)"
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
      :currentMusic="currentMusic"
      :isPlaying="isPlaying"
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
  color: var(--el-text-color-primary);
  background-color: var(--el-bg-color);
  transition: background-color 0.3s, color 0.3s;
}

.main-content {
  flex: 1;
  overflow: hidden; /* 修改为hidden，让子组件控制滚动 */
  padding: 16px;
  box-sizing: border-box; /* 确保padding不会导致超出容器 */
}

/* 仅保留应用特定的类名样式，移除全局主题变量定义 */
.dark-theme {
  color-scheme: dark;
}
</style>

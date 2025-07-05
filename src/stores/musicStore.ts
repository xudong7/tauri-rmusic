import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
// import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import type {
  MusicFile,
  SongInfo,
  SearchResult,
  PlaySongResult,
} from "../types/model";
import { ViewMode, PlayMode } from "../types/model";

export const useMusicStore = defineStore("music", () => {
  // 主题设置 - 优先从 localStorage 读取，如果没有则使用时间自动设置
  const savedTheme = localStorage.getItem("theme");
  const isDarkMode = ref(savedTheme ? savedTheme === "dark" : false);

  // 视图模式（本地/在线）
  const viewMode = ref<ViewMode>(ViewMode.LOCAL);

  // 播放模式
  const playMode = ref<PlayMode>(PlayMode.SEQUENTIAL);

  // 本地音乐相关
  const musicFiles = ref<MusicFile[]>([]);
  const currentDirectory = ref("");
  const currentMusic = ref<MusicFile | null>(null);
  // 默认目录
  const defaultDirectory = ref<string | null>(null);

  // 在线音乐相关
  const onlineSongs = ref<SongInfo[]>([]);
  const onlineSongsTotal = ref(0);
  const isSearchLoading = ref(false);
  const searchKeyword = ref("");
  const currentPage = ref(1);
  const pageSize = ref(20);
  const currentOnlineSong = ref<SongInfo | null>(null); // 播放相关
  const isPlaying = ref(false);
  const showImmersiveMode = ref(false);
  const currentPlayTime = ref(0);
  const isLoadingSong = ref(false); // 防止重复加载歌曲

  // 播放时间跟踪
  let playStartTimestamp = 0;
  let playTimeUpdateInterval: number | null = null;

  // 计算属性
  const hasCurrentTrack = computed(
    () => currentMusic.value !== null || currentOnlineSong.value !== null
  );

  const currentTrackInfo = computed(() => {
    if (viewMode.value === ViewMode.LOCAL && currentMusic.value) {
      return {
        name: currentMusic.value.file_name,
        artist: "",
        picUrl: "",
      };
    } else if (viewMode.value === ViewMode.ONLINE && currentOnlineSong.value) {
      return {
        name: currentOnlineSong.value.name,
        artist: currentOnlineSong.value.artists.join(", "),
        picUrl: currentOnlineSong.value.pic_url || "",
      };
    }
    return null;
  }); // 加载音乐文件
  async function loadMusicFiles(path?: string) {
    try {
      if (path) {
        currentDirectory.value = path;
      }
      musicFiles.value = await invoke("scan_files", {
        path: path || null,
        defaultDirectory: defaultDirectory.value,
      });
    } catch (error) {
      console.error("加载音乐文件失败:", error);
      ElMessage.error(`加载音乐文件失败: ${error}`);
    }
  }

  // 开始跟踪播放时间
  function startPlayTimeTracking() {
    stopPlayTimeTracking();
    const startOffset = currentPlayTime.value;
    playStartTimestamp = Date.now() - startOffset;
    playTimeUpdateInterval = window.setInterval(() => {
      currentPlayTime.value = Date.now() - playStartTimestamp;
    }, 200);
  }

  // 停止跟踪播放时间
  function stopPlayTimeTracking() {
    if (playTimeUpdateInterval !== null) {
      if (isPlaying.value && playStartTimestamp !== 0) {
        currentPlayTime.value = Date.now() - playStartTimestamp;
      }
      clearInterval(playTimeUpdateInterval);
      playTimeUpdateInterval = null;
    }
  } // 播放本地音乐
  async function playMusic(music: MusicFile) {
    try {
      console.log(`[播放控制] 开始播放本地音乐: ${music.file_name}`);

      // 设置加载状态
      isLoadingSong.value = true;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();

      // 设置当前音乐
      currentMusic.value = music;
      currentOnlineSong.value = null;

      const fullPath = `${currentDirectory.value}/${music.file_name}`;

      // 发送播放命令
      await invoke("handle_event", {
        event: JSON.stringify({
          action: "play",
          path: fullPath,
        }),
      });

      // 等待音乐开始播放
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 更新播放状态
      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      ElMessage.success(`正在播放: ${music.file_name}`);
      console.log(`[播放控制] 本地音乐播放成功: ${music.file_name}`);
    } catch (error) {
      console.error("[播放控制] 播放本地音乐失败:", error);
      ElMessage.error(`播放音乐失败: ${error}`);

      // 重置状态
      isLoadingSong.value = false;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();
    }
  } // 播放在线音乐
  async function playOnlineSong(song: SongInfo) {
    try {
      // 防止重复点击同一首歌
      if (
        currentOnlineSong.value?.id === song.id &&
        isPlaying.value &&
        !isLoadingSong.value
      ) {
        console.log("[播放控制] 歌曲正在播放，忽略重复请求");
        return;
      }

      // 防止在加载中时重复点击
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略重复请求");
        return;
      }

      console.log(
        `[播放控制] 开始播放在线歌曲: ${song.name} - ${song.artists.join(", ")}`
      );

      // 设置加载状态
      isLoadingSong.value = true;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();

      // 设置当前歌曲
      currentOnlineSong.value = song;
      currentMusic.value = null;

      // 获取播放URL和相关信息
      const playResult = await invoke<PlaySongResult>("play_netease_song", {
        id: song.id,
        name: song.name,
        artist: song.artists.join(", "),
      });

      console.log("[播放控制] 获取到播放URL，准备播放");

      // 播放歌曲
      await invoke("handle_event", {
        event: JSON.stringify({
          action: "play",
          path: playResult.url,
        }),
      });

      // 等待播放开始
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 设置播放状态
      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      // 更新歌曲封面URL（如果有的话）
      if (playResult.pic_url && currentOnlineSong.value) {
        currentOnlineSong.value.pic_url = playResult.pic_url;
      }

      ElMessage.success(`正在播放: ${song.name} - ${song.artists.join(", ")}`);
      console.log(`[播放控制] 在线歌曲播放成功: ${song.name}`);
    } catch (error) {
      console.error("[播放控制] 播放在线歌曲失败:", error);
      ElMessage.error(`播放失败: ${error}`);

      // 重置状态
      isLoadingSong.value = false;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();
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
        defaultDirectory: defaultDirectory.value,
      });
      ElMessage.success(`歌曲已下载: ${fileName}`); // 如果当前是本地模式且当前目录是默认目录的music子目录，则刷新文件列表
      if (viewMode.value === ViewMode.LOCAL && defaultDirectory.value) {
        const expectedMusicDir = `${defaultDirectory.value}/music`;
        if (
          currentDirectory.value === expectedMusicDir ||
          currentDirectory.value.replace(/\\/g, "/") === expectedMusicDir
        ) {
          await loadMusicFiles();
        }
      }
    } catch (error) {
      console.error("下载歌曲失败:", error);
      ElMessage.error(`下载歌曲失败: ${error}`);
    }
  }
  // 播放下一首或上一首音乐
  async function playNextOrPreviousMusic(step: number) {
    try {
      // 防止在加载中时切换歌曲
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略切换请求");
        return;
      }

      const direction = step > 0 ? "下" : "上";
      console.log(`[播放控制] 准备播放${direction}一首歌曲`);

      if (viewMode.value === ViewMode.LOCAL) {
        if (musicFiles.value.length === 0) {
          ElMessage.warning("没有可播放的本地音乐");
          return;
        }

        let currentIndex = musicFiles.value.findIndex(
          (file) => file.id === currentMusic.value?.id
        );

        if (currentIndex === -1) {
          currentIndex = 0;
        }

        let nextIndex = (currentIndex + step) % musicFiles.value.length;
        if (nextIndex < 0) {
          nextIndex = musicFiles.value.length + nextIndex;
        }

        console.log(
          `[播放控制] 本地音乐 - 当前索引: ${currentIndex}, 目标索引: ${nextIndex}`
        );
        await playMusic(musicFiles.value[nextIndex]);
      } else {
        if (onlineSongs.value.length === 0) {
          ElMessage.warning("没有可播放的在线音乐");
          return;
        }

        let currentIndex = onlineSongs.value.findIndex(
          (song) => song.id === currentOnlineSong.value?.id
        );

        if (currentIndex === -1) {
          currentIndex = 0;
        }

        let nextIndex = (currentIndex + step) % onlineSongs.value.length;
        if (nextIndex < 0) {
          nextIndex = onlineSongs.value.length + nextIndex;
        }

        console.log(
          `[播放控制] 在线音乐 - 当前索引: ${currentIndex}, 目标索引: ${nextIndex}`
        );
        await playOnlineSong(onlineSongs.value[nextIndex]);
      }
    } catch (error) {
      console.error(`[播放控制] 播放${step > 0 ? "下" : "上"}一首失败:`, error);
      ElMessage.error(`切换歌曲失败: ${error}`);
    }
  } // 暂停/恢复播放
  async function togglePlay() {
    try {
      // 如果正在加载中，忽略操作
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略播放/暂停操作");
        return;
      }

      // 如果没有当前曲目，忽略操作
      if (!hasCurrentTrack.value) {
        console.log("[播放控制] 没有当前曲目，忽略播放/暂停操作");
        return;
      }

      console.log(`[播放控制] ${isPlaying.value ? "暂停" : "恢复"}播放`);

      if (isPlaying.value) {
        // 暂停播放
        await invoke("handle_event", {
          event: JSON.stringify({
            action: "pause",
          }),
        });
        stopPlayTimeTracking();
        isPlaying.value = false;
      } else {
        // 恢复播放
        await invoke("handle_event", {
          event: JSON.stringify({
            action: "recovery",
          }),
        });
        startPlayTimeTracking();
        isPlaying.value = true;
      }

      console.log(
        `[播放控制] 播放状态已更新为: ${isPlaying.value ? "播放中" : "已暂停"}`
      );
    } catch (error) {
      console.error("[播放控制] 切换播放状态失败:", error);
      ElMessage.error(`切换播放状态失败: ${error}`);
    }
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

  // 在线搜索音乐
  async function searchOnlineMusic(keyword: string, page = 1) {
    try {
      if (page === 1) {
        onlineSongs.value = [];
        onlineSongsTotal.value = 0;
      }

      searchKeyword.value = keyword;
      currentPage.value = page;
      isSearchLoading.value = true;

      const result = await invoke<SearchResult>("search_songs", {
        keywords: keyword,
        page,
        pagesize: pageSize.value,
      });

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

  // 本地搜索音乐
  function searchLocalMusic(keyword: string) {
    if (!keyword.trim()) {
      refreshCurrentDirectory();
      return;
    }

    const filteredFiles = musicFiles.value.filter((file) =>
      file.file_name.toLowerCase().includes(keyword.toLowerCase())
    );
    musicFiles.value = filteredFiles;

    if (filteredFiles.length === 0) {
      ElMessage.info("未找到相关歌曲");
    } else {
      ElMessage.success(`找到 ${filteredFiles.length} 首相关歌曲`);
    }
  }

  // 加载更多在线音乐
  function loadMoreResults() {
    if (searchKeyword.value) {
      searchOnlineMusic(searchKeyword.value, currentPage.value + 1);
    }
  }

  // 切换视图模式
  function switchViewMode(mode: ViewMode) {
    viewMode.value = mode;

    if (mode === ViewMode.ONLINE) {
      onlineSongs.value = [];
      onlineSongsTotal.value = 0;
    } else if (mode === ViewMode.LOCAL && currentDirectory.value) {
      refreshCurrentDirectory();
    }
  }
  // 主题相关
  function setThemeByTime() {
    const now = new Date();
    const hours = now.getHours();
    const shouldBeDark = hours < 8 || hours >= 18;

    if (isDarkMode.value !== shouldBeDark) {
      isDarkMode.value = shouldBeDark;
      // 保存到 localStorage
      localStorage.setItem("theme", shouldBeDark ? "dark" : "light");
      applyTheme();
    }
  }

  // 应用当前主题
  function applyTheme() {
    if (isDarkMode.value) {
      document.documentElement.classList.add("dark");
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.setAttribute("data-theme", "light");
    }
  }

  // 切换主题 并保存在本地
  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value;
    // 保存到 localStorage
    localStorage.setItem("theme", isDarkMode.value ? "dark" : "light");
    applyTheme();
  }

  // 设置主题 并保存到本地
  function setTheme(dark: boolean) {
    isDarkMode.value = dark;
    // 保存到 localStorage
    localStorage.setItem("theme", dark ? "dark" : "light");
    applyTheme();
  }

  // 仅仅设置当前主题
  function setThemeWithoutSave(dark: boolean) {
    isDarkMode.value = dark;
    applyTheme();
  }

  // 沉浸模式
  function showImmersive() {
    if (currentOnlineSong.value || currentMusic.value) {
      if (isPlaying.value && playTimeUpdateInterval === null) {
        startPlayTimeTracking();
      }
      showImmersiveMode.value = true;
    }
  }

  function exitImmersive() {
    showImmersiveMode.value = false;
  } // 初始化
  async function initialize() {
    try {
      // 首先尝试从 localStorage 加载保存的默认目录
      const savedDefaultDir = localStorage.getItem("defaultDirectory");
      if (savedDefaultDir) {
        defaultDirectory.value = savedDefaultDir;
        // 设置当前目录为默认目录下的music子目录
        currentDirectory.value = `${savedDefaultDir}/music`;
        await loadMusicFiles();
      } else {
        // 如果没有保存的目录，使用系统默认目录
        const defaultDir = await invoke("get_default_music_dir");
        if (defaultDir) {
          // 系统默认目录已经是music目录，所以直接使用父目录作为defaultDirectory
          const parentDir = (defaultDir as string).replace(/[\/\\]music$/, "");
          defaultDirectory.value = parentDir;
          currentDirectory.value = defaultDir as string;
          await loadMusicFiles();
        }
      }
    } catch (error) {
      console.error("加载默认目录失败:", error);
    }

    // 只有在没有保存的主题设置时才根据时间自动设置
    const savedTheme = localStorage.getItem("theme");
    if (!savedTheme) {
      setThemeByTime();
    } else {
      // 如果有保存的主题，直接应用
      applyTheme();
    }
  }

  // 设置默认下载目录
  async function setDefaultDirectory(path: string) {
    try {
      defaultDirectory.value = path;
      // 保存到本地存储
      localStorage.setItem("defaultDirectory", path);
      ElMessage.success("默认下载目录设置成功");
    } catch (error) {
      console.error("设置默认目录失败:", error);
      ElMessage.error(`设置默认目录失败: ${error}`);
    }
  }

  // 获取默认下载目录
  function getDefaultDirectory(): string | null {
    return defaultDirectory.value;
  }

  // 重置默认下载目录为系统默认
  async function resetDefaultDirectory() {
    try {
      const systemDefaultDir = await invoke("get_default_music_dir");
      if (systemDefaultDir) {
        defaultDirectory.value = systemDefaultDir as string;
        // 移除本地存储的自定义目录
        localStorage.removeItem("defaultDirectory");
        // 重新加载音乐文件
        await loadMusicFiles(systemDefaultDir as string);
        ElMessage.success("已重置为默认下载目录");
      }
    } catch (error) {
      console.error("重置默认目录失败:", error);
      ElMessage.error(`重置默认目录失败: ${error}`);
    }
  }
  // 切换播放模式
  function togglePlayMode() {
    playMode.value =
      playMode.value === PlayMode.SEQUENTIAL
        ? PlayMode.RANDOM
        : PlayMode.SEQUENTIAL;
    const modeName =
      playMode.value === PlayMode.SEQUENTIAL ? "顺序播放" : "随机播放";
    ElMessage.success(`已切换到${modeName}模式`);
    console.log(`[播放控制] 播放模式已切换为: ${modeName}`);
  }

  // 计算播放步长（用于随机播放）
  function getRandomStep(): number {
    if (playMode.value === PlayMode.RANDOM) {
      const currentList =
        viewMode.value === ViewMode.LOCAL
          ? musicFiles.value
          : onlineSongs.value;
      if (currentList.length <= 1) return 1;

      // 生成1到列表长度-1之间的随机数，避免返回0（不切换歌曲）
      return Math.floor(Math.random() * (currentList.length - 1)) + 1;
    }
    return 1; // 顺序播放返回默认步长
  }
  
  // 获得默认的封面图片URL
  function getDefaultCoverUrl(): string {
    return "/icon-new.jpg";
  }

  return {
    // 状态
    isDarkMode,
    viewMode,
    playMode,
    musicFiles,
    currentDirectory,
    currentMusic,
    defaultDirectory,
    onlineSongs,
    onlineSongsTotal,
    isSearchLoading,
    searchKeyword,
    currentPage,
    pageSize,
    currentOnlineSong,
    isPlaying,
    isLoadingSong,
    showImmersiveMode,
    currentPlayTime,

    // 计算属性
    hasCurrentTrack,
    currentTrackInfo,

    // 方法
    loadMusicFiles,
    // selectDirectory,
    setDefaultDirectory,
    getDefaultDirectory,
    resetDefaultDirectory,
    playMusic,
    playOnlineSong,
    downloadOnlineSong,
    playNextOrPreviousMusic,
    togglePlay,
    togglePlayMode,
    getRandomStep,
    adjustVolume,
    refreshCurrentDirectory,
    searchOnlineMusic,
    searchLocalMusic,
    loadMoreResults,
    switchViewMode,
    toggleTheme,
    setTheme,
    setThemeWithoutSave,
    applyTheme,
    showImmersive,
    exitImmersive,
    initialize,
    startPlayTimeTracking,
    stopPlayTimeTracking,
    getDefaultCoverUrl,
  };
});

<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import HeaderBar from "./components/HeaderBar/HeaderBar.vue";
import PlayerBar from "./components/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/ImmersiveView/ImmersiveView.vue";
import { useMusicStore } from "./stores/musicStore";
import { ViewMode } from "./types/model";

// 获取当前窗口标签，用于判断是否显示HeaderBar和PlayerBar
const windowLabel = ref<string>("");
const isSettingsWindow = ref<boolean>(false);

const musicStore = useMusicStore();

// 处理搜索 - 根据当前视图模式执行不同的搜索
function handleSearch(keyword: string) {
  if (musicStore.viewMode === ViewMode.LOCAL) {
    musicStore.searchLocalMusic(keyword);
  } else {
    musicStore.searchOnlineMusic(keyword);
  }
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
      musicStore.playNextOrPreviousMusic(-1);
      event.preventDefault();
      break;
    case " ":
      musicStore.togglePlay();
      event.preventDefault();
      break;
    case "ArrowRight":
      musicStore.playNextOrPreviousMusic(1);
      event.preventDefault();
      break;
  }
}

// 设置监听播放结束的定时器
function setupPlaybackEndDetection() {
  let playbackCheckInterval: number | null = null;
  let lastCheckTime = 0;
  let stableEmptyCount = 0; // 连续检测到空的次数
  let stablePlayingCount = 0; // 连续检测到正在播放的次数
  let hasStartedPlaying = false; // 是否已经开始播放过

  // 清理之前的定时器
  if (playbackCheckInterval) {
    clearInterval(playbackCheckInterval);
  }

  // 定期检查播放状态
  playbackCheckInterval = window.setInterval(async () => {
    // 如果歌曲正在加载中，不进行检测
    if (musicStore.isLoadingSong) {
      console.log("[播放检测] 歌曲加载中，跳过检测");
      stableEmptyCount = 0;
      stablePlayingCount = 0;
      hasStartedPlaying = false;
      return;
    }

    // 只在有歌曲且状态为播放时才检查
    if (!musicStore.hasCurrentTrack || !musicStore.isPlaying) {
      stableEmptyCount = 0;
      stablePlayingCount = 0;
      hasStartedPlaying = false;
      return;
    }

    try {
      // 检查sink是否为空
      const isEmpty = await invoke<boolean>("is_sink_empty");
      const currentTime = Date.now();

      if (isEmpty) {
        stableEmptyCount++;
        stablePlayingCount = 0;

        console.log(
          `[播放检测] 检测到空状态，连续次数: ${stableEmptyCount}, 是否已开始播放: ${hasStartedPlaying}`
        );

        // 只有在已经确认开始播放过的情况下，才认为空状态是播放结束
        // 需要连续5次检测到空状态，并且距离上次检查至少过了2秒
        if (
          hasStartedPlaying &&
          stableEmptyCount >= 5 &&
          currentTime - lastCheckTime > 2000
        ) {
          console.log("[播放检测] 确认播放结束，准备播放下一首");

          // 停止播放状态和时间跟踪
          musicStore.isPlaying = false;
          musicStore.stopPlayTimeTracking();

          // 等待一小段时间确保状态稳定
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 播放下一首
          await musicStore.playNextOrPreviousMusic(1);

          // 重置所有计数器
          stableEmptyCount = 0;
          stablePlayingCount = 0;
          hasStartedPlaying = false;
          lastCheckTime = currentTime;
        }
      } else {
        // 检测到正在播放
        stablePlayingCount++;
        stableEmptyCount = 0;

        // 连续检测到3次正在播放，确认歌曲已经开始播放
        if (stablePlayingCount >= 3) {
          if (!hasStartedPlaying) {
            console.log("[播放检测] 确认歌曲已开始播放");
            hasStartedPlaying = true;
          }
        }
      }
    } catch (error) {
      console.error("[播放检测] 检查播放状态失败:", error);
      stableEmptyCount = 0;
      stablePlayingCount = 0;
    }
  }, 1000); // 每秒检查一次

  // 在组件卸载时清理定时器
  const originalStopTracking = musicStore.stopPlayTimeTracking;
  musicStore.stopPlayTimeTracking = () => {
    originalStopTracking();
    if (playbackCheckInterval) {
      clearInterval(playbackCheckInterval);
      playbackCheckInterval = null;
    }
  };
}

// 处理跨窗口主题同步
function handleStorageChange(event: StorageEvent) {
  if (event.key === "theme" && event.newValue) {
    console.log("主窗口检测到主题变化:", event.newValue);
    // 如果主题变化，更新音乐商店的主题状态
    // 使用不保存到 localStorage 的方法，避免循环调用
    musicStore.setThemeWithoutSave(event.newValue === "dark");
  }
}

// 初始化
onMounted(async () => {
  // 获取当前窗口标签
  const webviewWindow = getCurrentWebviewWindow();
  windowLabel.value = webviewWindow.label;
  isSettingsWindow.value = webviewWindow.label === "settings";

  console.log("当前窗口标签:", windowLabel.value);
  console.log("是否为设置窗口:", isSettingsWindow.value);

  // 只有非设置窗口才初始化音乐功能
  if (!isSettingsWindow.value) {
    await musicStore.initialize();

    // 添加全局键盘事件监听
    window.addEventListener("keydown", handleKeyDown);

    // 添加跨窗口主题同步监听
    window.addEventListener("storage", handleStorageChange);

    // 设置播放结束检测
    setupPlaybackEndDetection();
  }
});

// 组件卸载时清理事件监听器和定时器
onUnmounted(() => {
  // 只有非设置窗口才清理这些监听器
  if (!isSettingsWindow.value) {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("storage", handleStorageChange);
    musicStore.stopPlayTimeTracking();
  }
});
</script>

<template>
  <!-- @contextmenu.prevent -->
  <div class="music-app" :class="{ 'dark-theme': musicStore.isDarkMode }">
    <!-- 顶部搜索和文件夹选择 - 只在主窗口显示 -->
    <!-- @select-directory="musicStore.selectDirectory" -->
    <HeaderBar
      v-if="!isSettingsWindow"
      :currentDirectory="musicStore.currentDirectory"
      :viewMode="musicStore.viewMode"
      :isDarkMode="musicStore.isDarkMode"
      @refresh="musicStore.refreshCurrentDirectory"
      @search="handleSearch"
      @toggle-theme="musicStore.toggleTheme"
      @previous-track="musicStore.playNextOrPreviousMusic(-1)"
      @toggle-play="musicStore.togglePlay"
      @next-track="musicStore.playNextOrPreviousMusic(1)"
    />

    <!-- 主内容区域 - 路由出口 -->
    <div class="main-content" :class="{ 'settings-content': isSettingsWindow }">
      <router-view />
    </div>

    <!-- 底部播放控制栏 - 只在主窗口显示 -->
    <PlayerBar
      v-if="!isSettingsWindow"
      :currentMusic="musicStore.currentMusic"
      :currentOnlineSong="musicStore.currentOnlineSong"
      :isPlaying="musicStore.isPlaying"
      @toggle-play="musicStore.togglePlay"
      @volume-change="musicStore.adjustVolume"
      @previous="musicStore.playNextOrPreviousMusic(-1)"
      @next="musicStore.playNextOrPreviousMusic(1)"
      @show-immersive="musicStore.showImmersive"
    />

    <!-- 沉浸模式 - 只在主窗口显示 -->
    <ImmersiveView
      v-if="!isSettingsWindow && musicStore.showImmersiveMode"
      :currentSong="musicStore.currentOnlineSong"
      :currentMusic="musicStore.currentMusic"
      :isPlaying="musicStore.isPlaying"
      :currentTime="musicStore.currentPlayTime"
      @toggle-play="musicStore.togglePlay"
      @next="musicStore.playNextOrPreviousMusic(1)"
      @previous="musicStore.playNextOrPreviousMusic(-1)"
      @exit="musicStore.exitImmersive"
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

/* 设置窗口的内容样式 */
.settings-content {
  padding: 0; /* 设置窗口不需要额外的padding */
}

/* 仅保留应用特定的类名样式，移除全局主题变量定义 */
.dark-theme {
  color-scheme: dark;
}
</style>

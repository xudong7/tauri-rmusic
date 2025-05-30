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
  let checkInterval: number | null = null;
  console.log("初始化播放结束检测机制");

  // 监听播放状态变化
  watch(
    () => musicStore.isPlaying,
    (playing) => {
      // 如果开始播放，则启动定时器检查是否播放结束
      if (playing) {
        console.log("播放状态变为播放中，开始监听播放结束");

        if (checkInterval !== null) {
          clearInterval(checkInterval);
          console.log("清除旧的检测定时器");
        }

        // 添加歌曲开始播放的时间戳，用于避免歌曲刚开始播放就检测到结束
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
              if (isEmpty && musicStore.isPlaying) {
                // 添加日志，帮助调试
                console.log("检测到歌曲播放完成，已播放时长(ms):", playingTime);

                // 歌曲已结束，自动播放下一首
                console.log("歌曲播放完成，准备播放下一首");
                musicStore.isPlaying = false;

                if (checkInterval !== null) {
                  clearInterval(checkInterval);
                  checkInterval = null;
                }

                // 自动播放下一首
                musicStore.playNextOrPreviousMusic(1);
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

    // 设置播放结束检测
    setupPlaybackEndDetection();
  }
});

// 组件卸载时清理事件监听器和定时器
onUnmounted(() => {
  // 只有非设置窗口才清理这些监听器
  if (!isSettingsWindow.value) {
    window.removeEventListener("keydown", handleKeyDown);
    musicStore.stopPlayTimeTracking();
  }
});
</script>

<template>
  <div
    class="music-app"
    :class="{ 'dark-theme': musicStore.isDarkMode }"
    @contextmenu.prevent
  >
    <!-- 顶部搜索和文件夹选择 - 只在主窗口显示 -->
    <HeaderBar
      v-if="!isSettingsWindow"
      :currentDirectory="musicStore.currentDirectory"
      :viewMode="musicStore.viewMode"
      :isDarkMode="musicStore.isDarkMode"
      @select-directory="musicStore.selectDirectory"
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

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import HeaderBar from "./components/HeaderBar/HeaderBar.vue";
import PlayerBar from "./components/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/ImmersiveView/ImmersiveView.vue";
import { useMusicStore } from "./stores/musicStore";
import { ViewMode, PlayMode } from "./types/model";

// 获取当前窗口标签，用于判断是否显示HeaderBar和PlayerBar
const windowLabel = ref<string>("");
const isSettingsWindow = ref<boolean>(false);

const musicStore = useMusicStore();

// 动态计算播放步长
function getPlayStep(direction: number): number {
  if (musicStore.playMode === PlayMode.RANDOM) {
    return musicStore.getRandomStep();
  }
  return Math.abs(direction); // 返回方向的绝对值作为步长
}

// 播放状态检测器
class PlaybackDetector {
  private interval: number | null = null;
  private consecutiveEmptyCount = 0;
  private lastCheckTime = 0;
  private readonly CHECK_INTERVAL = 1000; // 1秒检查一次
  private readonly REQUIRED_EMPTY_COUNT = 3; // 需要连续3次检测到空状态
  private readonly MIN_TIME_BETWEEN_CHECKS = 1000; // 最小检查间隔

  constructor(private musicStore: any) {}

  // 开始检测
  start() {
    this.stop(); // 确保之前的检测已停止
    this.resetCounters();

    console.log("[播放检测器] 开始播放状态检测");

    this.interval = window.setInterval(async () => {
      await this.checkPlaybackStatus();
    }, this.CHECK_INTERVAL);
  }

  // 停止检测
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[播放检测器] 停止播放状态检测");
    }
    this.resetCounters();
  }

  // 重置计数器
  private resetCounters() {
    this.consecutiveEmptyCount = 0;
    this.lastCheckTime = Date.now();
  }

  // 检查播放状态
  private async checkPlaybackStatus() {
    // 检查是否满足自动播放下一首的条件
    const shouldAutoPlayNext = this.shouldAutoPlayNext();

    if (!shouldAutoPlayNext) {
      this.resetCounters();
      return;
    }

    try {
      const isEmpty = await invoke<boolean>("is_sink_empty");
      const currentTime = Date.now();

      if (isEmpty) {
        this.consecutiveEmptyCount++;
        console.log(
          `[播放检测器] 检测到Sink为空，连续次数: ${this.consecutiveEmptyCount}/${this.REQUIRED_EMPTY_COUNT}`
        );

        // 判断是否满足播放下一首的条件
        if (this.shouldTriggerNextTrack(currentTime)) {
          await this.handleTrackEnd();
        }
      } else {
        // Sink不为空，重置计数器
        this.consecutiveEmptyCount = 0;
      }
    } catch (error) {
      console.error("[播放检测器] 检查播放状态失败:", error);
      this.resetCounters();
    }
  }
  // 判断是否应该自动播放下一首
  private shouldAutoPlayNext(): boolean {
    const { isLoadingSong, hasCurrentTrack } = this.musicStore;

    // 必须有当前曲目
    if (!hasCurrentTrack) return false;

    // 如果正在加载歌曲，不进行检测
    if (isLoadingSong) return false;

    // 如果没有在播放状态，也进行检测（可能是播放结束了）
    return true;
  }

  // 判断是否应该触发下一首
  private shouldTriggerNextTrack(currentTime: number): boolean {
    return (
      this.consecutiveEmptyCount >= this.REQUIRED_EMPTY_COUNT &&
      currentTime - this.lastCheckTime > this.MIN_TIME_BETWEEN_CHECKS
    );
  }

  // 处理曲目结束
  private async handleTrackEnd() {
    console.log("[播放检测器] 检测到播放结束，准备播放下一首");

    try {
      // 停止当前播放状态
      this.musicStore.isPlaying = false;
      this.musicStore.stopPlayTimeTracking();

      // 等待状态稳定
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 播放下一首
      await this.musicStore.playNextOrPreviousMusic(getPlayStep(1));

      // 重置计数器
      this.resetCounters();

      console.log("[播放检测器] 成功切换到下一首");
    } catch (error) {
      console.error("[播放检测器] 播放下一首失败:", error);
      this.resetCounters();
    }
  }
}

// 创建播放检测器实例
const playbackDetector = new PlaybackDetector(musicStore);

// 监听播放状态变化，智能控制检测器
const playbackState = computed(() => ({
  hasTrack: musicStore.hasCurrentTrack,
  isPlaying: musicStore.isPlaying,
  isLoading: musicStore.isLoadingSong,
}));

// 使用watch监听状态变化
watch(
  playbackState,
  (newState, oldState) => {
    const { hasTrack, isPlaying, isLoading } = newState;

    console.log("[状态监听器] 播放状态变化:", {
      hasTrack,
      isPlaying,
      isLoading,
      changed: JSON.stringify(newState) !== JSON.stringify(oldState),
    });

    // 如果有曲目且不在加载中，启动检测器
    if (hasTrack && !isLoading) {
      playbackDetector.start();
    } else {
      // 没有曲目或正在加载，停止检测器
      playbackDetector.stop();
    }
  },
  { immediate: true, deep: true }
);

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
      musicStore.playNextOrPreviousMusic(-getPlayStep(-1));
      event.preventDefault();
      break;
    case " ":
      musicStore.togglePlay();
      event.preventDefault();
      break;
    case "ArrowRight":
      musicStore.playNextOrPreviousMusic(getPlayStep(1));
      event.preventDefault();
      break;
  }
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
  }
});

// 组件卸载时清理事件监听器和检测器
onUnmounted(() => {
  // 只有非设置窗口才清理这些监听器
  if (!isSettingsWindow.value) {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("storage", handleStorageChange);
    musicStore.stopPlayTimeTracking();

    // 停止播放检测器
    playbackDetector.stop();
  }
});
</script>

<template>
  <!-- @contextmenu.prevent -->
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
      @refresh="musicStore.refreshCurrentDirectory"
      @search="handleSearch"
      @toggle-theme="musicStore.toggleTheme"
      @previous-track="musicStore.playNextOrPreviousMusic(-getPlayStep(-1))"
      @toggle-play="musicStore.togglePlay"
      @next-track="musicStore.playNextOrPreviousMusic(getPlayStep(1))"
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
      :playMode="musicStore.playMode"
      @toggle-play="musicStore.togglePlay"
      @volume-change="musicStore.adjustVolume"
      @previous="musicStore.playNextOrPreviousMusic(-getPlayStep(-1))"
      @next="musicStore.playNextOrPreviousMusic(getPlayStep(1))"
      @toggle-play-mode="musicStore.togglePlayMode"
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
      @next="musicStore.playNextOrPreviousMusic(getPlayStep(1))"
      @previous="musicStore.playNextOrPreviousMusic(-getPlayStep(-1))"
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
  transition:
    background-color 0.3s,
    color 0.3s;
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

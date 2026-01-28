<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { ElConfigProvider } from "element-plus";
import HeaderBar from "./components/layout/HeaderBar/HeaderBar.vue";
import Sidebar from "./components/layout/Sidebar/Sidebar.vue";
import PlayerBar from "./components/feature/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/feature/ImmersiveView/ImmersiveView.vue";
import { ViewMode } from "./types/model";
import { usePlaybackDetector } from "./composables/usePlaybackDetector";
import { useThemeStore } from "./stores/themeStore";
import { useViewStore } from "./stores/viewStore";
import { useLocalMusicStore } from "./stores/localMusicStore";
import { useOnlineMusicStore } from "./stores/onlineMusicStore";
import { usePlayerStore } from "./stores/playerStore";

const { locale } = useI18n();
const elementLocale = computed(() => (locale.value === "zh" ? zhCn : en));

const themeStore = useThemeStore();
const viewStore = useViewStore();
const localStore = useLocalMusicStore();
const onlineStore = useOnlineMusicStore();
const playerStore = usePlayerStore();

const { start: detectorStart, stop: detectorStop } = usePlaybackDetector(
  playerStore as any,
  (d) => playerStore.getPlayStep(d)
);

const playbackState = computed(() => ({
  hasTrack: playerStore.hasCurrentTrack,
  isLoading: playerStore.isLoadingSong,
}));

watch(
  playbackState,
  (s) => {
    if (s.hasTrack && !s.isLoading) detectorStart();
    else detectorStop();
  },
  { immediate: true, deep: true }
);

function handleSearch(keyword: string) {
  if (viewStore.viewMode === ViewMode.LOCAL) localStore.searchLocalMusic(keyword);
  else onlineStore.searchOnlineMusic(keyword);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    return;
  const step = playerStore.getPlayStep;
  switch (e.key) {
    case "ArrowLeft":
      playerStore.playNextOrPreviousMusic(-step(-1));
      e.preventDefault();
      break;
    case " ":
      playerStore.togglePlay();
      e.preventDefault();
      break;
    case "ArrowRight":
      playerStore.playNextOrPreviousMusic(step(1));
      e.preventDefault();
      break;
  }
}

function handleStorageChange(e: StorageEvent) {
  if (e.key === "theme" && e.newValue)
    themeStore.setThemeWithoutSave(e.newValue === "dark");
}

onMounted(async () => {
  try {
    await localStore.initializeLocalLibrary();
    themeStore.initializeTheme();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("storage", handleStorageChange);
  } catch (e) {
    console.error("App init error:", e);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("storage", handleStorageChange);
  playerStore.stopPlayTimeTracking();
  detectorStop();
});
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div
      class="music-app"
      :class="{ 'dark-theme': themeStore.isDarkMode }"
      @contextmenu.prevent
    >
      <HeaderBar
        :viewMode="viewStore.viewMode"
        :isDarkMode="themeStore.isDarkMode"
        @search="handleSearch"
        @toggle-theme="themeStore.toggleTheme"
      />
      <div class="app-body">
        <Sidebar />
        <div class="main-content">
          <router-view />
        </div>
      </div>
      <PlayerBar
        :currentMusic="playerStore.currentMusic"
        :currentOnlineSong="playerStore.currentOnlineSong"
        :isPlaying="playerStore.isPlaying"
        :playMode="playerStore.playMode"
        @toggle-play="playerStore.togglePlay"
        @volume-change="playerStore.adjustVolume"
        @previous="playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1))"
        @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
        @toggle-play-mode="playerStore.togglePlayMode"
        @show-immersive="playerStore.showImmersive"
      />

      <ImmersiveView
        v-if="viewStore.showImmersiveMode"
        :currentSong="playerStore.currentOnlineSong"
        :currentMusic="playerStore.currentMusic"
        :isPlaying="playerStore.isPlaying"
        :currentTime="playerStore.currentPlayTime"
        @toggle-play="playerStore.togglePlay"
        @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
        @previous="playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1))"
        @exit="playerStore.exitImmersive"
      />
    </div>
  </el-config-provider>
</template>

<style>
.music-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background-color: var(--app-page-bg, var(--el-bg-color));
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: var(--app-spacing-xl, 28px);
  box-sizing: border-box;
}

.dark-theme {
  color-scheme: dark;
}
</style>

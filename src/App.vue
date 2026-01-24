<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import HeaderBar from "./components/HeaderBar/HeaderBar.vue";
import Sidebar from "./components/Sidebar/Sidebar.vue";
import PlayerBar from "./components/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/ImmersiveView/ImmersiveView.vue";
import { useMusicStore } from "./stores/musicStore";
import { ViewMode } from "./types/model";
import { usePlaybackDetector } from "./composables/usePlaybackDetector";

const isSettingsWindow = ref(false);
const musicStore = useMusicStore();
const { start: detectorStart, stop: detectorStop } = usePlaybackDetector(
  musicStore as any,
  (d) => musicStore.getPlayStep(d)
);

const playbackState = computed(() => ({
  hasTrack: musicStore.hasCurrentTrack,
  isLoading: musicStore.isLoadingSong,
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
  if (musicStore.viewMode === ViewMode.LOCAL) musicStore.searchLocalMusic(keyword);
  else musicStore.searchOnlineMusic(keyword);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    return;
  const step = musicStore.getPlayStep;
  switch (e.key) {
    case "ArrowLeft":
      musicStore.playNextOrPreviousMusic(-step(-1));
      e.preventDefault();
      break;
    case " ":
      musicStore.togglePlay();
      e.preventDefault();
      break;
    case "ArrowRight":
      musicStore.playNextOrPreviousMusic(step(1));
      e.preventDefault();
      break;
  }
}

function handleStorageChange(e: StorageEvent) {
  if (e.key === "theme" && e.newValue)
    musicStore.setThemeWithoutSave(e.newValue === "dark");
}

onMounted(async () => {
  try {
    const { label } = getCurrentWebviewWindow();
    isSettingsWindow.value = label === "settings";
  } catch {
    isSettingsWindow.value = false;
  }

  if (!isSettingsWindow.value) {
    await musicStore.initialize();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("storage", handleStorageChange);
  }
});

onUnmounted(() => {
  if (!isSettingsWindow.value) {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("storage", handleStorageChange);
    musicStore.stopPlayTimeTracking();
    detectorStop();
  }
});
</script>

<template>
  <div
    class="music-app"
    :class="{ 'dark-theme': musicStore.isDarkMode }"
    @contextmenu.prevent
  >
    <template v-if="!isSettingsWindow">
      <HeaderBar
        :viewMode="musicStore.viewMode"
        :isDarkMode="musicStore.isDarkMode"
        @search="handleSearch"
        @toggle-theme="musicStore.toggleTheme"
      />
      <div class="app-body">
        <Sidebar />
        <div class="main-content">
          <router-view />
        </div>
      </div>
      <PlayerBar
        :currentMusic="musicStore.currentMusic"
        :currentOnlineSong="musicStore.currentOnlineSong"
        :isPlaying="musicStore.isPlaying"
        :playMode="musicStore.playMode"
        @toggle-play="musicStore.togglePlay"
        @volume-change="musicStore.adjustVolume"
        @previous="musicStore.playNextOrPreviousMusic(-musicStore.getPlayStep(-1))"
        @next="musicStore.playNextOrPreviousMusic(musicStore.getPlayStep(1))"
        @toggle-play-mode="musicStore.togglePlayMode"
        @show-immersive="musicStore.showImmersive"
      />
    </template>
    <template v-else>
      <div class="main-content settings-content">
        <router-view />
      </div>
    </template>

    <ImmersiveView
      v-if="!isSettingsWindow && musicStore.showImmersiveMode"
      :currentSong="musicStore.currentOnlineSong"
      :currentMusic="musicStore.currentMusic"
      :isPlaying="musicStore.isPlaying"
      :currentTime="musicStore.currentPlayTime"
      @toggle-play="musicStore.togglePlay"
      @next="musicStore.playNextOrPreviousMusic(musicStore.getPlayStep(1))"
      @previous="musicStore.playNextOrPreviousMusic(-musicStore.getPlayStep(-1))"
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

.settings-content {
  padding: 0;
}

.dark-theme {
  color-scheme: dark;
}
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { ElConfigProvider } from "element-plus";
import HeaderBar from "./components/layout/HeaderBar/HeaderBar.vue";
import Sidebar from "./components/layout/Sidebar/Sidebar.vue";
import PlayerBar from "./components/feature/PlayerBar/PlayerBar.vue";
import ImmersiveView from "./components/feature/ImmersiveView/ImmersiveView.vue";
import { ViewMode } from "./types/model";
import { useAppKeyboardShortcuts } from "./composables/useAppKeyboardShortcuts";
import { useStorageThemeSync } from "./composables/useStorageThemeSync";
import { useTrayPlaybackEvents } from "./composables/useTrayPlaybackEvents";
import { useWindowSizeConstraints } from "./composables/useWindowSizeConstraints";
import { useThemeStore } from "./stores/themeStore";
import { useViewStore } from "./stores/viewStore";
import { useLocalMusicStore } from "./stores/localMusicStore";
import { useOnlineMusicStore } from "./stores/onlineMusicStore";
import { useOnlineServiceStore } from "./stores/onlineServiceStore";
import { usePlayerStore } from "./stores/playerStore";
import { usePlaylistStore } from "./stores/playlistStore";

const { locale } = useI18n();
const elementLocale = computed(() => (locale.value === "zh" ? zhCn : en));

const themeStore = useThemeStore();
const viewStore = useViewStore();
const localStore = useLocalMusicStore();
const onlineStore = useOnlineMusicStore();
const onlineServiceStore = useOnlineServiceStore();
const playerStore = usePlayerStore();
const playlistStore = usePlaylistStore();

const windowSizeConstraints = useWindowSizeConstraints({
  minWidth: 900,
  minHeight: 640,
});
const keyboardShortcuts = useAppKeyboardShortcuts({
  onPrevious: () => playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1)),
  onTogglePlay: () => playerStore.togglePlay(),
  onNext: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1)),
});
const themeSync = useStorageThemeSync({
  setThemeWithoutSave: themeStore.setThemeWithoutSave,
});
const trayEvents = useTrayPlaybackEvents({
  onPrevious: () => playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1)),
  onNext: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1)),
  onPlay: () => playerStore.syncPlaybackStateFromTray(true),
  onPause: () => playerStore.syncPlaybackStateFromTray(false),
});

function handleSearch(keyword: string) {
  if (viewStore.viewMode === ViewMode.LOCAL) localStore.searchLocalMusic(keyword);
  else onlineStore.searchOnlineMusic(keyword);
}

onMounted(async () => {
  try {
    await windowSizeConstraints.apply();
    await localStore.initializeLocalLibrary();
    await playlistStore.loadPlaylists();
    themeStore.initializeTheme();
    keyboardShortcuts.start();
    themeSync.start();
    onlineServiceStore.start();
    await trayEvents.start();
  } catch (e) {
    console.error("App init error:", e);
  }
});

onUnmounted(() => {
  keyboardShortcuts.stop();
  themeSync.stop();
  onlineServiceStore.stop();
  trayEvents.stop();
  playerStore.stopPlayTimeTracking();
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
        :currentPlayTime="playerStore.currentPlayTime"
        :currentTrackDuration="playerStore.currentTrackDuration"
        @toggle-play="playerStore.togglePlay"
        @volume-change="playerStore.adjustVolume"
        @previous="playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1))"
        @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
        @toggle-play-mode="playerStore.togglePlayMode"
        @show-immersive="playerStore.showImmersive"
        @seek="playerStore.seekToPosition"
      />

      <ImmersiveView
        v-if="viewStore.showImmersiveMode"
        :currentSong="playerStore.currentOnlineSong"
        :currentMusic="playerStore.currentMusic"
        :isPlaying="playerStore.isPlaying"
        :currentTime="playerStore.currentPlayTime"
        :currentTrackDuration="playerStore.currentTrackDuration"
        :playMode="playerStore.playMode"
        @toggle-play="playerStore.togglePlay"
        @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
        @previous="playerStore.playNextOrPreviousMusic(-playerStore.getPlayStep(-1))"
        @exit="playerStore.exitImmersive"
        @seek="playerStore.seekToPosition"
        @volume-change="playerStore.adjustVolume"
        @toggle-play-mode="playerStore.togglePlayMode"
      />
    </div>
  </el-config-provider>
</template>

<style>
.music-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
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
  padding: var(--app-content-padding, var(--app-spacing-xl, 28px));
  box-sizing: border-box;
}

.dark-theme {
  color-scheme: dark;
}
</style>

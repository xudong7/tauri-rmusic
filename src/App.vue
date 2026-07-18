<script setup lang="ts">
import {
  onMounted,
  onUnmounted,
  computed,
  nextTick,
  watch,
  type WatchStopHandle,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { ElConfigProvider } from "element-plus";
import HeaderBar from "./components/layout/HeaderBar/HeaderBar.vue";
import Sidebar from "./components/layout/Sidebar/Sidebar.vue";
import PlayerBar from "./components/feature/PlayerBar/PlayerBar.vue";
import PlaybackQueue from "./components/feature/PlaybackQueue/PlaybackQueue.vue";
import ImmersiveView from "./components/feature/ImmersiveView/ImmersiveView.vue";
import type { SearchScope } from "./types/model";
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
import { quitApp } from "./api/commands/system";

const { locale } = useI18n();
const elementLocale = computed(() => (locale.value === "zh" ? zhCn : en));
const elementMessageConfig = {
  offset: 72,
  max: 3,
};

const themeStore = useThemeStore();
const viewStore = useViewStore();
const localStore = useLocalMusicStore();
const onlineStore = useOnlineMusicStore();
const onlineServiceStore = useOnlineServiceStore();
const playerStore = usePlayerStore();
const playlistStore = usePlaylistStore();
const route = useRoute();
const router = useRouter();
let isQuitting = false;
let stopOnlineScopeWatch: WatchStopHandle | null = null;

const searchScope = computed<SearchScope | null>(() => {
  if (route.name === "LocalMusic") return "local";
  if (route.name === "OnlineMusic" || route.name === "Artist") return "online";
  if (route.name === "Playlist" || route.name === "PlaylistNew") return "playlist";
  return null;
});

const windowSizeConstraints = useWindowSizeConstraints({
  minWidth: 760,
  minHeight: 640,
});
const keyboardShortcuts = useAppKeyboardShortcuts({
  onPrevious: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1)),
  onTogglePlay: () => playerStore.togglePlay(),
  onNext: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1)),
});
const themeSync = useStorageThemeSync({
  setThemeWithoutSave: themeStore.setThemeWithoutSave,
});
const trayEvents = useTrayPlaybackEvents({
  onPrevious: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1)),
  onNext: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1)),
  onPlay: () => playerStore.syncPlaybackStateFromTray(true),
  onPause: () => playerStore.syncPlaybackStateFromTray(false),
  onQuit: () => {
    void quitAfterFlush();
  },
});

async function handleSearch(keyword: string, scope: SearchScope) {
  const kw = keyword.trim();
  if (scope === "local") {
    localStore.searchLocalMusic(kw);
    return;
  }

  if (scope === "playlist") {
    viewStore.setPlaylistSearchKeyword(kw);
    return;
  }

  if (route.name !== "OnlineMusic") {
    await router.push({ name: "OnlineMusic" });
  }

  if (kw) {
    await onlineServiceStore.ensureStarted();
    await onlineStore.searchOnlineMusic(kw);
  } else {
    onlineStore.resetResults();
  }
}

function flushPlaylistSave() {
  void playlistStore.flushSave();
}

async function closePlaybackQueue() {
  viewStore.closePlaybackQueue();
  await nextTick();
  document.querySelector<HTMLButtonElement>(".queue-btn")?.focus();
}

async function quitAfterFlush() {
  if (isQuitting) return;
  isQuitting = true;
  try {
    await playlistStore.flushSave();
  } catch (error) {
    console.error("Flush playlist before quit failed:", error);
  } finally {
    await quitApp();
  }
}

function runInitTask(name: string, task: () => Promise<unknown>) {
  return task().catch((error) => {
    console.error(`[app:init] ${name} failed:`, error);
  });
}

onMounted(() => {
  keyboardShortcuts.start();
  themeSync.start();
  window.addEventListener("beforeunload", flushPlaylistSave);
  window.addEventListener("pagehide", flushPlaylistSave);

  void Promise.all([
    runInitTask("window constraints", () => windowSizeConstraints.apply()),
    runInitTask("local library", () => localStore.initializeLocalLibrary()),
    runInitTask("playlists", () => playlistStore.loadPlaylists()),
    runInitTask("playback volume", () => playerStore.syncVolumeToBackend()),
    runInitTask("playback events", () => playerStore.startPlaybackEventListening()),
    runInitTask("tray events", () => trayEvents.start()),
  ]);

  stopOnlineScopeWatch = watch(
    searchScope,
    (scope) => {
      if (scope === "online") onlineServiceStore.start();
      else onlineServiceStore.stop();
    },
    { immediate: true }
  );
});

onUnmounted(() => {
  keyboardShortcuts.stop();
  themeSync.stop();
  stopOnlineScopeWatch?.();
  stopOnlineScopeWatch = null;
  onlineServiceStore.stop();
  trayEvents.stop();
  playerStore.stopPlayTimeTracking();
  playerStore.stopPlaybackEventListening();
  window.removeEventListener("beforeunload", flushPlaylistSave);
  window.removeEventListener("pagehide", flushPlaylistSave);
  flushPlaylistSave();
});
</script>

<template>
  <el-config-provider :locale="elementLocale" :message="elementMessageConfig">
    <div class="music-app" :class="{ 'dark-theme': themeStore.isDarkMode }">
      <HeaderBar
        :searchScope="searchScope"
        :isDarkMode="themeStore.isDarkMode"
        @search="handleSearch"
      />
      <div class="app-body">
        <Sidebar />
        <div class="main-content">
          <router-view />
        </div>
      </div>
      <PlaybackQueue
        v-if="viewStore.showPlaybackQueue"
        :items="playerStore.playbackQueueItems"
        :title="playerStore.playbackQueueTitle"
        :is-playing="playerStore.isPlaying"
        @close="closePlaybackQueue"
        @play="playerStore.playQueueItem"
      />
      <PlayerBar
        :currentMusic="playerStore.currentMusic"
        :currentOnlineSong="playerStore.currentOnlineSong"
        :isPlaying="playerStore.isPlaying"
        :playbackPhase="playerStore.playbackPhase"
        :playMode="playerStore.playMode"
        :volume="playerStore.volume"
        :currentPlayTime="playerStore.currentPlayTime"
        :currentTrackDuration="playerStore.currentTrackDuration"
        @toggle-play="playerStore.togglePlay"
        @volume-change="playerStore.adjustVolume"
        @previous="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1))"
        @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
        @toggle-play-mode="playerStore.togglePlayMode"
        @toggle-queue="viewStore.togglePlaybackQueue"
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
        @previous="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1))"
        @exit="playerStore.exitImmersive"
        @seek="playerStore.seekToPosition"
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
  background: var(--app-page-bg, var(--el-bg-color));
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: var(--app-content-padding, var(--app-spacing-xl, 28px));
  box-sizing: border-box;
  background: var(--app-subtle-surface);
}

@media (max-width: 840px) {
  .main-content {
    padding: var(--app-content-padding-compact);
  }
}

.dark-theme {
  color-scheme: dark;
}
</style>

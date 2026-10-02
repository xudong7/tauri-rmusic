<script setup lang="ts">
import {
  onMounted,
  onUnmounted,
  computed,
  nextTick,
  ref,
  watch,
  type WatchStopHandle,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { ElConfigProvider, ElMessage } from "element-plus";
import HeaderBar from "./components/layout/HeaderBar/HeaderBar.vue";
import Sidebar from "./components/layout/Sidebar/Sidebar.vue";
import PlayerBar from "./components/feature/PlayerBar/PlayerBar.vue";
import PlaybackQueue from "./components/feature/PlaybackQueue/PlaybackQueue.vue";
import ImmersiveView from "./components/feature/ImmersiveView/ImmersiveView.vue";
import ContextMenu from "./components/base/ContextMenu/ContextMenu.vue";
import type { SearchScope } from "./types/model";
import { useAppKeyboardShortcuts } from "./composables/useAppKeyboardShortcuts";
import { usePlaybackQueueRouteReset } from "./composables/usePlaybackQueueRouteReset";
import { useStorageThemeSync } from "./composables/useStorageThemeSync";
import { useTrayPlaybackEvents } from "./composables/useTrayPlaybackEvents";
import { useWindowSizeConstraints } from "./composables/useWindowSizeConstraints";
import { useFileDropImport } from "./composables/useFileDropImport";
import { useLyricsBroadcast } from "./composables/useLyricsBroadcast";
import { useLyricsOverlay } from "./composables/useLyricsOverlay";
import { useSystemMediaControls } from "./composables/useSystemMediaControls";
import { getCoverFlightSource, playCoverFlight } from "./composables/useCoverFlight";
import { useThemeStore } from "./stores/themeStore";
import { useViewStore } from "./stores/viewStore";
import { useLocalMusicStore } from "./stores/localMusicStore";
import { useOnlineMusicStore } from "./stores/onlineMusicStore";
import { useOnlineServiceStore } from "./stores/onlineServiceStore";
import { usePlayerStore } from "./stores/playerStore";
import { usePlaylistStore } from "./stores/playlistStore";
import { quitApp, revealMainWindow } from "./api/commands/system";
import { STORAGE_KEY_LAST_ROUTE, WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "./constants";

const { locale, t } = useI18n();
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
let stopRouteWatch: WatchStopHandle | null = null;

// 在线相关的路由必须全部列在这里：未映射会返回 null，导致搜索框消失、
// 在线服务状态灯隐藏，并且下方 watch 会停掉服务健康轮询。
const ONLINE_ROUTE_NAMES = ["OnlineMusic", "Artist", "OnlinePlaylist", "OnlineAlbum"];

const searchScope = computed<SearchScope | null>(() => {
  if (route.name === "LocalMusic") return "local";
  if (ONLINE_ROUTE_NAMES.includes(String(route.name))) return "online";
  if (route.name === "Playlist" || route.name === "PlaylistNew") return "playlist";
  return null;
});

const windowSizeConstraints = useWindowSizeConstraints({
  minWidth: WINDOW_MIN_WIDTH,
  minHeight: WINDOW_MIN_HEIGHT,
});
const { isDraggingAudioFiles, dragAudioCount } = useFileDropImport({
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
  onImported: () => {
    void localStore.refreshCurrentDirectory();
  },
});

// 桌面歌词：主窗负责跟随进度推送当前歌词行
const { isLyricsOverlayOpen } = useLyricsOverlay();
useLyricsBroadcast(isLyricsOverlayOpen);

// 系统媒体控制：推元数据、接媒体键
useSystemMediaControls();
const keyboardShortcuts = useAppKeyboardShortcuts({
  onPrevious: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1)),
  onTogglePlay: () => playerStore.togglePlay(),
  onNext: () => playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1)),
});
const themeSync = useStorageThemeSync({
  setThemeWithoutSave: themeStore.setThemeWithoutSave,
});
// 不带返回值：内部那个 watcher 挂在当前组件的 scope 上，随卸载自动停
usePlaybackQueueRouteReset();
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
    try {
      await onlineServiceStore.ensureStarted();
      // 只搜索当前激活的 tab，不向四个端点扇出。
      await onlineStore.searchActiveTab(kw);
    } catch (error) {
      // 这里原本把 error.message 拼在提示后面，但那是 sidecar 的技术串
      // （"Online service is unavailable"）——中文界面下混进一句英文，
      // 且与前半句语义重复。具体原因走 console。
      console.error("Online service unavailable before search:", error);
      ElMessage.error(t("onlineService.unavailable"));
    }
  } else {
    onlineStore.resetResults();
  }
}

function flushPlaylistSave() {
  void playlistStore.flushSave();
}

/** 退出前把播放进度落在盘上：pagehide/beforeunload 是最后的同步窗口。 */
function persistSessionNow() {
  playerStore.persistSession(true);
}

function handleBeforeUnload() {
  flushPlaylistSave();
  persistSessionNow();
}

/** 恢复上次所在的路由；新建歌单的中间态（PlaylistNew）不恢复。 */
function restoreLastRoute() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY_LAST_ROUTE);
  } catch {
    return;
  }
  if (!saved || saved === "/") return;
  void router.replace(saved).catch((error) => {
    console.warn("[app:init] restore last route failed:", error);
  });
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
  // 首帧已经画好：本地界面此刻可用，不必为了预热中的在线服务继续压着窗口。
  // 后端最多等 2s 兜底；这里提前显示，纯本地用户不用对着空白等近 2 秒。
  void runInitTask("reveal window", () => revealMainWindow());

  keyboardShortcuts.start();
  themeSync.start();
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handleBeforeUnload);

  void Promise.all([
    runInitTask("window constraints", () => windowSizeConstraints.apply()),
    runInitTask("local library", () => localStore.initializeLocalLibrary()),
    runInitTask("playlists", () => playlistStore.loadPlaylists()),
    runInitTask("last route", async () => {
      await router.isReady();
      restoreLastRoute();
    }),
    runInitTask("playback volume", () => playerStore.syncVolumeToBackend()),
    runInitTask("playback clock", async () => {
      // 组件重挂载（开发时的 HMR 等）会停掉播放时钟，但 store 仍是「播放中」。
      // 挂载时按 store 状态恢复，否则进度条与歌词会一直冻结。
      if (playerStore.isPlaying && playerStore.hasCurrentTrack) {
        playerStore.startPlayTimeTracking();
      }
    }),
    runInitTask("playback events", () => playerStore.startPlaybackEventListening()),
    runInitTask("tray events", () => trayEvents.start()),
  ]).then(() => {
    // 曲库与歌单就绪之后才能把上次的曲目/队列还原成可播放的引用
    playerStore.restoreSession();
  });

  stopRouteWatch = watch(
    () => route.fullPath,
    () => {
      // PlaylistNew 只是个跳板，恢复它会在启动时凭空新建一个歌单
      if (route.name === "PlaylistNew") return;
      try {
        localStorage.setItem(STORAGE_KEY_LAST_ROUTE, route.fullPath);
      } catch (error) {
        console.warn("[app] save last route failed:", error);
      }
    },
    { immediate: true }
  );

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
  stopRouteWatch?.();
  stopRouteWatch = null;
  onlineServiceStore.stop();
  trayEvents.stop();
  playerStore.stopPlayTimeTracking();
  playerStore.stopPlaybackEventListening();
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handleBeforeUnload);
  flushPlaylistSave();
});

const immersiveViewRef = ref<InstanceType<typeof ImmersiveView> | null>(null);

/** 进入沉浸：先让沉浸页挂载（量它的封面矩形），再把播放栏封面飞过去。
    飞行期间沉浸页自己的封面藏起来，落位后由飞行引擎恢复。 */
async function handleShowImmersive() {
  playerStore.showImmersive();
  await nextTick();
  await playCoverFlight(
    getCoverFlightSource(),
    immersiveViewRef.value?.coverElement ?? null,
    {
      phase: "enter",
      hideTarget: true,
    }
  );
}

/** 退出沉浸：沉浸页还在 DOM 里时量两端矩形，然后反向飞回播放栏封面 */
async function handleExitImmersive() {
  const from = immersiveViewRef.value?.coverElement ?? null;
  const to = getCoverFlightSource();
  playerStore.exitImmersive();
  await playCoverFlight(from, to, { phase: "leave", hideTarget: false });
}
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
          <router-view v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </router-view>
        </div>
      </div>
      <!-- 过渡类名（.queue-enter-* / .queue-leave-*）写在 PlaybackQueue.vue 自己的
           scoped 样式里，不在这里：那边最后一个复合选择器会自动带上 [data-v-*]，
           才压得过 .queue-panel 自己声明的 pointer-events。
           不加 :key —— BaseTransition 靠 isSameVNodeType 复用正在离场的节点，
           key 一变会同时存在两个面板。 -->
      <Transition name="queue">
        <PlaybackQueue
          v-if="viewStore.showPlaybackQueue"
          :items="playerStore.playbackQueueItems"
          :title="playerStore.playbackQueueTitle"
          :is-playing="playerStore.isPlaying"
          @close="closePlaybackQueue"
          @play="playerStore.playQueueItem"
        />
      </Transition>
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
        @show-immersive="handleShowImmersive"
        @seek="playerStore.seekToPosition"
      />

      <!-- 过渡类名写在 ImmersiveView.css（scoped）里，理由同上面的队列。
           同样不加 :key。 -->
      <Transition name="immersive">
        <ImmersiveView
          v-if="viewStore.showImmersiveMode"
          ref="immersiveViewRef"
          :currentSong="playerStore.currentOnlineSong"
          :currentMusic="playerStore.currentMusic"
          :isPlaying="playerStore.isPlaying"
          :currentTime="playerStore.currentPlayTime"
          :currentTrackDuration="playerStore.currentTrackDuration"
          :playMode="playerStore.playMode"
          :volume="playerStore.volume"
          @toggle-play="playerStore.togglePlay"
          @next="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(1))"
          @previous="playerStore.playNextOrPreviousMusic(playerStore.getPlayStep(-1))"
          @exit="handleExitImmersive"
          @seek="playerStore.seekToPosition"
          @toggle-play-mode="playerStore.togglePlayMode"
          @volume-change="playerStore.adjustVolume"
          @toggle-queue="viewStore.togglePlaybackQueue"
        />
      </Transition>
      <!-- 全局唯一的右键菜单实例；行/卡片只负责 open() -->
      <ContextMenu />

      <!-- 从系统拖音频进窗口：整屏提示，松手即导入曲库 -->
      <Transition name="drop">
        <div v-if="isDraggingAudioFiles" class="drop-overlay" aria-hidden="true">
          <div class="drop-overlay__card">
            <p class="drop-overlay__title">{{ t("import.dropTitle") }}</p>
            <p class="drop-overlay__hint">
              {{ t("import.dropHint", { count: dragAudioCount }) }}
            </p>
          </div>
        </div>
      </Transition>
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
  background: var(--app-content-bg, var(--app-subtle-surface));
  border-top-left-radius: var(--app-radius-lg);
}

@media (max-width: 840px) {
  .main-content {
    padding: var(--app-content-padding-compact);
  }
}

.dark-theme {
  color-scheme: dark;
}

/* 页面切换：纯淡入淡出，不带动效里的位移——transform 会给固定定位的
   子元素建新的包含块，而视图里可能有固定元素。out-in 保证新旧页面
   不会同框，也就不会在过渡期间出现两套滚动条。 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.14s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}

/* 共享元素转场的飞行副本：挂在 body 上（见 useCoverFlight），只动 transform。
   位置与尺寸由 JS 设成终点封面的矩形，transform-origin: 0 0 让起点矩形能
   精确对上；背景用封面图，飞行时带一点投影把它从画面里托起来。 */
.cover-flight {
  position: fixed;
  z-index: 2000;
  transform-origin: 0 0;
  border-radius: 8px;
  background-color: var(--el-fill-color);
  background-size: cover;
  background-position: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
  pointer-events: none;
  will-change: transform;
}

/* 拖文件进窗口的整屏提示。pointer-events: none 是必须的：提示层出现时
   鼠标还在拖拽中，命中原生 drop 的必须是 webview 本身而不是这层 UI。 */
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.34);
  pointer-events: none;
}

.drop-overlay__card {
  padding: 24px 32px;
  border: 1px dashed var(--app-focus-ring);
  border-radius: var(--app-radius-lg);
  background: var(--el-bg-color-overlay);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
  text-align: center;
}

.drop-overlay__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 650;
  color: var(--el-text-color-primary);
}

.drop-overlay__hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease;
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .drop-enter-active,
  .drop-leave-active {
    transition: none;
  }
}
</style>

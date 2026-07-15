import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MusicFile, SongInfo } from "@/types/model";
import { PlayMode, ViewMode } from "@/types/model";
import { i18n } from "@/i18n";
import { joinPathSegment } from "@/utils/pathUtils";
import { getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { getPlaybackStep, getSequentialIndex } from "@/utils/playbackQueue";
import {
  handleEvent,
  playNeteaseSong,
  playTrack,
  prefetchNeteaseSong,
  getPlaybackState,
  seekTo,
} from "@/api/commands/music";
import { usePlaybackClock } from "@/composables/usePlaybackClock";
import { usePlaybackQueue, type PlayOnlineOptions } from "@/composables/usePlaybackQueue";
import { usePlaybackVolume } from "@/composables/usePlaybackVolume";
import { useViewStore } from "./viewStore";
import { useLocalMusicStore } from "./localMusicStore";
import { useOnlineMusicStore } from "./onlineMusicStore";
import { usePlaylistStore } from "./playlistStore";

function debugPlaybackLog(message: string) {
  if (import.meta.env.DEV) console.debug(message);
}

function getLocalTrackKey(file: MusicFile): string {
  return file.relative_path || file.file_name;
}

interface PlaybackEndedPayload {
  position_ms: number;
  duration_ms: number;
  track_id: number;
}

interface PlaybackSnapshot {
  music: MusicFile | null;
  onlineSong: SongInfo | null;
  onlineQueue: SongInfo[];
  playlistId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  backendTrackId: number;
}

const MAX_SHUFFLE_HISTORY_SIZE = 200;

export const usePlayerStore = defineStore("player", () => {
  const viewStore = useViewStore();
  const localStore = useLocalMusicStore();
  const onlineStore = useOnlineMusicStore();
  const playlistStore = usePlaylistStore();

  const playMode = ref<PlayMode>(PlayMode.SEQUENTIAL);

  const currentMusic = ref<MusicFile | null>(null);
  const currentOnlineSong = ref<SongInfo | null>(null);
  const isPlaying = ref(false);
  const isLoadingSong = ref(false);
  const currentPlayTime = ref(0);
  const currentTrackDurationMs = ref(0);
  const currentBackendTrackId = ref(0);
  let handlingEndedTrackId = 0;
  let playbackEventRequested = false;
  let playbackEndedUnlisten: UnlistenFn | null = null;
  let playbackEventStartPromise: Promise<void> | null = null;
  let shuffleContextKey = "";
  let shuffleHistory: string[] = [];
  let shuffleCursor = -1;
  /** 当前从播放列表播放时记录列表 id，用于上一曲/下一曲 */
  const currentPlaylistId = ref<string | null>(null);

  const playbackVolume = usePlaybackVolume({
    setBackendVolume: (nextVolume) => handleEvent("volume", { volume: nextVolume }),
  });
  const { volume, adjustVolume, syncVolumeToBackend } = playbackVolume;

  const playbackQueue = usePlaybackQueue({
    getPlayMode: () => playMode.value,
    getViewMode: () => viewStore.viewMode,
    getFallbackOnlineQueue: () => onlineStore.onlineSongs,
    getCurrentPlaylistId: () => currentPlaylistId.value,
    setCurrentPlaylistId: (id) => {
      currentPlaylistId.value = id;
    },
    getPlaylist: playlistStore.getPlaylist,
    prefetchOnlineSong: prefetchNeteaseSong,
  });
  const currentOnlineQueue = playbackQueue.currentOnlineQueue;

  const hasCurrentTrack = computed(
    () => currentMusic.value !== null || currentOnlineSong.value !== null
  );
  const localMusicByFileName = computed(() => {
    const map = new Map<string, MusicFile>();
    for (const file of localStore.musicFiles) {
      map.set(file.file_name, file);
    }
    return map;
  });

  const currentTrackDuration = computed(() => {
    if (currentTrackDurationMs.value > 0) return currentTrackDurationMs.value;
    if (currentOnlineSong.value?.duration) return currentOnlineSong.value.duration;
    return 0;
  });

  const currentTrackInfo = computed(() => {
    if (currentOnlineSong.value) {
      return {
        name: currentOnlineSong.value.name,
        artist: currentOnlineSong.value.artists.join(", "),
        picUrl: currentOnlineSong.value.pic_url || "",
      };
    }
    if (currentMusic.value) {
      const display = getLocalMusicDisplayInfo(currentMusic.value);
      return {
        name: display.title,
        artist: display.artist,
        picUrl: "",
      };
    }
    return null;
  });

  function clampPlayTime(positionMs: number): number {
    const duration = currentTrackDuration.value;
    const safePosition = Math.max(0, positionMs || 0);
    return duration > 0 ? Math.min(safePosition, duration) : safePosition;
  }

  function resetProgressState() {
    currentPlayTime.value = 0;
    currentTrackDurationMs.value = 0;
    currentBackendTrackId.value = 0;
  }

  function capturePlaybackSnapshot(): PlaybackSnapshot {
    return {
      music: currentMusic.value,
      onlineSong: currentOnlineSong.value,
      onlineQueue: [...currentOnlineQueue.value],
      playlistId: currentPlaylistId.value,
      isPlaying: isPlaying.value,
      positionMs: currentPlayTime.value,
      durationMs: currentTrackDurationMs.value,
      backendTrackId: currentBackendTrackId.value,
    };
  }

  function restorePlaybackSnapshot(snapshot: PlaybackSnapshot) {
    currentMusic.value = snapshot.music;
    currentOnlineSong.value = snapshot.onlineSong;
    currentOnlineQueue.value = snapshot.onlineQueue;
    currentPlaylistId.value = snapshot.playlistId;
    currentPlayTime.value = snapshot.positionMs;
    currentTrackDurationMs.value = snapshot.durationMs;
    currentBackendTrackId.value = snapshot.backendTrackId;
    isPlaying.value = snapshot.isPlaying;
    if (snapshot.isPlaying && (snapshot.music || snapshot.onlineSong)) {
      startPlayTimeTracking();
    } else {
      stopPlayTimeTracking();
    }
  }

  function resetShuffleHistory() {
    shuffleContextKey = "";
    shuffleHistory = [];
    shuffleCursor = -1;
  }

  function updateProgressFromBackend(progress: {
    position_ms: number;
    duration_ms: number;
    is_ended?: boolean;
    track_id?: number;
  }) {
    if (
      progress.track_id !== undefined &&
      currentBackendTrackId.value > 0 &&
      progress.track_id !== currentBackendTrackId.value
    ) {
      return;
    }
    if (progress.duration_ms > 0) {
      currentTrackDurationMs.value = progress.duration_ms;
    }
    currentPlayTime.value = clampPlayTime(progress.position_ms);
  }

  async function handlePlaybackEnded(trackId = currentBackendTrackId.value) {
    if (
      trackId <= 0 ||
      trackId !== currentBackendTrackId.value ||
      handlingEndedTrackId === trackId ||
      !hasCurrentTrack.value ||
      isLoadingSong.value
    )
      return;

    handlingEndedTrackId = trackId;
    try {
      isPlaying.value = false;
      playbackClock.stop({ updatePosition: false });

      if (playMode.value === PlayMode.REPEAT_ONE) {
        await replayCurrentSong();
      } else {
        await playNextOrPreviousMusic(getPlayStep(1));
      }
    } finally {
      if (handlingEndedTrackId === trackId) handlingEndedTrackId = 0;
    }
  }

  async function startPlaybackEventListening() {
    if (playbackEventRequested) return playbackEventStartPromise ?? Promise.resolve();
    playbackEventRequested = true;
    playbackEventStartPromise = (async () => {
      const unlisten = await listen<PlaybackEndedPayload>("playback-ended", (event) => {
        const payload = event.payload;
        if (payload.track_id !== currentBackendTrackId.value) return;
        updateProgressFromBackend({ ...payload, is_ended: true });
        void handlePlaybackEnded(payload.track_id);
      });
      if (playbackEventRequested) playbackEndedUnlisten = unlisten;
      else unlisten();
    })().finally(() => {
      playbackEventStartPromise = null;
    });
    return playbackEventStartPromise;
  }

  function stopPlaybackEventListening() {
    playbackEventRequested = false;
    playbackEndedUnlisten?.();
    playbackEndedUnlisten = null;
  }

  const playbackClock = usePlaybackClock({
    getBackendState: getPlaybackState,
    getCurrentPosition: () => currentPlayTime.value,
    getIsPlaying: () => isPlaying.value,
    getHasTrack: () => hasCurrentTrack.value,
    getIsLoading: () => isLoadingSong.value,
    setPosition: (positionMs) => {
      currentPlayTime.value = clampPlayTime(positionMs);
    },
    setDuration: (durationMs) => {
      if (durationMs > 0) currentTrackDurationMs.value = durationMs;
    },
    shouldAcceptState: (state) =>
      currentBackendTrackId.value === 0 || state.track_id === currentBackendTrackId.value,
    onEnded: handlePlaybackEnded,
  });

  function startPlayTimeTracking() {
    playbackClock.start();
  }

  function prefetchOnlineSong(song: SongInfo) {
    return playbackQueue.prefetchOnlineSong(song.id);
  }

  function stopPlayTimeTracking() {
    playbackClock.stop();
  }

  async function playMusic(music: MusicFile, options?: { fromPlaylistId?: string }) {
    const previousPlayback = capturePlaybackSnapshot();
    try {
      if (!options?.fromPlaylistId) currentPlaylistId.value = null;
      playbackQueue.clearOnlineQueue();
      debugPlaybackLog(`[播放控制] 开始播放本地音乐: ${music.file_name}`);

      isLoadingSong.value = true;
      isPlaying.value = false;
      stopPlayTimeTracking();
      resetProgressState();

      currentMusic.value = music;
      currentOnlineSong.value = null;

      const fullPath = joinPathSegment(localStore.currentDirectory, music.file_name);
      const playResult = await playTrack({ type: "local", path: fullPath });
      currentBackendTrackId.value = playResult.track_id;
      updateProgressFromBackend(playResult);

      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      if (options?.fromPlaylistId) currentPlaylistId.value = options.fromPlaylistId;
      debugPlaybackLog(`[播放控制] 本地音乐播放成功: ${music.file_name}`);
    } catch (error) {
      console.error("[播放控制] 播放本地音乐失败:", error);
      ElMessage.error(`${i18n.global.t("errors.playFailed")}: ${error}`);
      isLoadingSong.value = false;
      restorePlaybackSnapshot(previousPlayback);
    }
  }

  async function playOnlineSong(song: SongInfo, options?: PlayOnlineOptions) {
    const previousPlayback = capturePlaybackSnapshot();
    try {
      if (
        currentOnlineSong.value?.id === song.id &&
        isPlaying.value &&
        !isLoadingSong.value
      ) {
        playbackQueue.applyOnlinePlaybackContext(options);
        void playbackQueue.prefetchNextOnlineSong(song);
        debugPlaybackLog("[播放控制] 歌曲正在播放，忽略重复请求");
        return;
      }
      if (isLoadingSong.value) {
        debugPlaybackLog("[播放控制] 歌曲正在加载中，忽略重复请求");
        return;
      }
      playbackQueue.applyOnlinePlaybackContext(options);

      debugPlaybackLog(
        `[播放控制] 开始播放在线歌曲: ${song.name} - ${song.artists.join(", ")}`
      );

      isLoadingSong.value = true;
      isPlaying.value = false;
      stopPlayTimeTracking();
      resetProgressState();

      currentOnlineSong.value = song;
      currentMusic.value = null;

      const playResult = await playNeteaseSong({
        id: song.id,
        name: song.name,
        artist: song.artists.join(", "),
        picUrl: song.pic_url || undefined,
      });

      debugPlaybackLog("[播放控制] 获取到播放URL，准备播放");
      const startResult = await playTrack({
        type: "online",
        url: playResult.url,
        cache_key: song.id,
      });
      currentBackendTrackId.value = startResult.track_id;
      updateProgressFromBackend(startResult);

      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      if (playResult.pic_url && currentOnlineSong.value) {
        currentOnlineSong.value.pic_url = playResult.pic_url;
      }
      if (options?.fromPlaylistId) currentPlaylistId.value = options.fromPlaylistId;

      debugPlaybackLog(`[播放控制] 在线歌曲播放成功: ${song.name}`);
      void playbackQueue.prefetchNextOnlineSong(song);
    } catch (error) {
      console.error("[播放控制] 播放在线歌曲失败:", error);
      ElMessage.error(`${i18n.global.t("errors.playFailedOnline")}: ${error}`);
      isLoadingSong.value = false;
      restorePlaybackSnapshot(previousPlayback);
    }
  }

  async function playFromPlaylist(playlistId: string, index: number) {
    const list = playlistStore.getPlaylist(playlistId);
    if (!list || index < 0 || index >= list.items.length) return;
    const item = list.items[index];
    if (item.type === "local") {
      const file = localMusicByFileName.value.get(item.file_name);
      if (file) await playMusic(file, { fromPlaylistId: playlistId });
      else ElMessage.warning(i18n.global.t("messages.noLocalMusic"));
    } else {
      await playOnlineSong(item.song, { fromPlaylistId: playlistId });
    }
  }

  async function togglePlay() {
    try {
      if (isLoadingSong.value) {
        debugPlaybackLog("[播放控制] 歌曲正在加载中，忽略播放/暂停操作");
        return;
      }
      if (!hasCurrentTrack.value) {
        debugPlaybackLog("[播放控制] 没有当前曲目，忽略播放/暂停操作");
        return;
      }

      debugPlaybackLog(`[播放控制] ${isPlaying.value ? "暂停" : "恢复"}播放`);
      if (isPlaying.value) {
        await handleEvent("pause", {});
        stopPlayTimeTracking();
        isPlaying.value = false;
      } else {
        await handleEvent("recovery", {});
        startPlayTimeTracking();
        isPlaying.value = true;
      }
    } catch (error) {
      console.error("[播放控制] 切换播放状态失败:", error);
      ElMessage.error(`${i18n.global.t("errors.togglePlayFailed")}: ${error}`);
    }
  }

  interface ShuffleTarget {
    key: string;
    play: () => Promise<void>;
  }

  function alignShuffleHistory(contextKey: string, currentKey: string | null) {
    if (shuffleContextKey !== contextKey) {
      shuffleContextKey = contextKey;
      shuffleHistory = currentKey ? [currentKey] : [];
      shuffleCursor = shuffleHistory.length - 1;
      return;
    }

    if (!currentKey || shuffleHistory[shuffleCursor] === currentKey) return;
    const previousIndex = shuffleHistory.lastIndexOf(currentKey);
    if (previousIndex >= 0) {
      shuffleCursor = previousIndex;
    } else {
      shuffleHistory = [currentKey];
      shuffleCursor = 0;
    }
  }

  function getShuffleTargets(): {
    contextKey: string;
    currentKey: string | null;
    targets: ShuffleTarget[];
  } {
    if (currentPlaylistId.value) {
      const playlistId = currentPlaylistId.value;
      const list = playlistStore.getPlaylist(playlistId);
      const targets: ShuffleTarget[] = [];
      for (let index = 0; index < (list?.items.length ?? 0); index++) {
        const item = list!.items[index];
        if (item.type === "local" && !localMusicByFileName.value.has(item.file_name)) {
          continue;
        }
        const key =
          item.type === "local" ? `local:${item.file_name}` : `online:${item.song.id}`;
        targets.push({
          key,
          play: () => playFromPlaylist(playlistId, index),
        });
      }
      const currentKey = currentMusic.value
        ? `local:${currentMusic.value.file_name}`
        : currentOnlineSong.value
          ? `online:${currentOnlineSong.value.id}`
          : null;
      return { contextKey: `playlist:${playlistId}`, currentKey, targets };
    }

    if (currentMusic.value) {
      return {
        contextKey: `local:${localStore.currentDirectory ?? "default"}`,
        currentKey: getLocalTrackKey(currentMusic.value),
        targets: localStore.musicFiles.map((music) => ({
          key: getLocalTrackKey(music),
          play: () => playMusic(music),
        })),
      };
    }

    const queue = playbackQueue.getActiveOnlineQueue();
    return {
      contextKey: `online:${queue[0]?.id ?? "empty"}`,
      currentKey: currentOnlineSong.value?.id ?? null,
      targets: queue.map((song) => ({
        key: song.id,
        play: () => playOnlineSong(song, { queue }),
      })),
    };
  }

  async function playRandomWithHistory(direction: number) {
    const { contextKey, currentKey, targets } = getShuffleTargets();
    if (targets.length === 0) return;
    alignShuffleHistory(contextKey, currentKey);

    let targetKey: string | null = null;
    if (direction < 0) {
      while (shuffleCursor > 0) {
        shuffleCursor--;
        const candidate = shuffleHistory[shuffleCursor];
        if (targets.some((target) => target.key === candidate)) {
          targetKey = candidate;
          break;
        }
      }
    } else if (shuffleCursor < shuffleHistory.length - 1) {
      while (shuffleCursor < shuffleHistory.length - 1) {
        shuffleCursor++;
        const candidate = shuffleHistory[shuffleCursor];
        if (targets.some((target) => target.key === candidate)) {
          targetKey = candidate;
          break;
        }
      }
    } else {
      const visited = new Set(shuffleHistory);
      let candidates = targets.filter(
        (target) => target.key !== currentKey && !visited.has(target.key)
      );
      if (candidates.length === 0) {
        candidates = targets.filter((target) => target.key !== currentKey);
      }
      if (candidates.length === 0) return;

      targetKey = candidates[Math.floor(Math.random() * candidates.length)].key;
      shuffleHistory = shuffleHistory.slice(0, shuffleCursor + 1);
      shuffleHistory.push(targetKey);
      if (shuffleHistory.length > MAX_SHUFFLE_HISTORY_SIZE) {
        shuffleHistory.shift();
      }
      shuffleCursor = shuffleHistory.length - 1;
    }

    const target = targets.find((item) => item.key === targetKey);
    if (target) await target.play();
  }

  async function playNextOrPreviousMusic(step: number) {
    try {
      if (isLoadingSong.value) {
        debugPlaybackLog("[播放控制] 歌曲正在加载中，忽略切换请求");
        return;
      }

      if (playMode.value === PlayMode.RANDOM) {
        await playRandomWithHistory(step);
        return;
      }

      const direction = step > 0 ? "下" : "上";
      debugPlaybackLog(`[播放控制] 准备播放${direction}一首歌曲`);

      if (currentPlaylistId.value) {
        const list = playlistStore.getPlaylist(currentPlaylistId.value);
        if (list && list.items.length > 0) {
          let currentIndex = -1;
          for (let i = 0; i < list.items.length; i++) {
            const it = list.items[i];
            if (it.type === "local" && currentMusic.value?.file_name === it.file_name) {
              currentIndex = i;
              break;
            }
            if (it.type === "online" && currentOnlineSong.value?.id === it.song.id) {
              currentIndex = i;
              break;
            }
          }
          if (currentIndex === -1) currentIndex = 0;
          const nextIndex = getSequentialIndex(currentIndex, step, list.items.length);
          await playFromPlaylist(currentPlaylistId.value, nextIndex);
          return;
        }
        currentPlaylistId.value = null;
      }

      if (viewStore.viewMode === ViewMode.LOCAL) {
        if (localStore.musicFiles.length === 0) {
          ElMessage.warning(i18n.global.t("messages.noLocalMusic"));
          return;
        }

        let currentIndex = localStore.musicFiles.findIndex(
          (file) =>
            currentMusic.value !== null &&
            getLocalTrackKey(file) === getLocalTrackKey(currentMusic.value)
        );
        if (currentIndex === -1) currentIndex = 0;

        const nextIndex = getSequentialIndex(
          currentIndex,
          step,
          localStore.musicFiles.length
        );

        await playMusic(localStore.musicFiles[nextIndex]);
      } else {
        const queue = playbackQueue.getActiveOnlineQueue();
        if (queue.length === 0) {
          ElMessage.warning(i18n.global.t("messages.noOnlineMusic"));
          return;
        }

        let currentIndex = queue.findIndex(
          (song) => song.id === currentOnlineSong.value?.id
        );
        if (currentIndex === -1) currentIndex = 0;

        const nextIndex = getSequentialIndex(currentIndex, step, queue.length);

        await playOnlineSong(queue[nextIndex], { queue });
      }
    } catch (error) {
      console.error(`[播放控制] 播放${step > 0 ? "下" : "上"}一首失败:`, error);
      ElMessage.error(`${i18n.global.t("errors.switchFailed")}: ${error}`);
    }
  }

  function getCurrentStepListLength(): number {
    if (currentPlaylistId.value) {
      const list = playlistStore.getPlaylist(currentPlaylistId.value);
      return list?.items.length ?? 0;
    }
    return viewStore.viewMode === ViewMode.LOCAL
      ? localStore.musicFiles.length
      : playbackQueue.getActiveOnlineQueue().length;
  }

  function getPlayStep(direction: number): number {
    return getPlaybackStep({
      playMode: playMode.value,
      length: getCurrentStepListLength(),
      direction,
    });
  }

  function togglePlayMode() {
    const modes = [PlayMode.SEQUENTIAL, PlayMode.RANDOM, PlayMode.REPEAT_ONE];
    const currentIndex = modes.indexOf(playMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    playMode.value = modes[nextIndex];
    resetShuffleHistory();

    const modeKey =
      playMode.value === PlayMode.SEQUENTIAL
        ? "playerBar.sequential"
        : playMode.value === PlayMode.RANDOM
          ? "playerBar.random"
          : "playerBar.repeatOne";
    const modeName = i18n.global.t(modeKey);
    ElMessage.success(i18n.global.t("messages.playModeSwitch", { mode: modeName }));
  }

  async function replayCurrentSong() {
    if (currentMusic.value) {
      await playMusic(
        currentMusic.value,
        currentPlaylistId.value ? { fromPlaylistId: currentPlaylistId.value } : undefined
      );
    } else if (currentOnlineSong.value) {
      await playOnlineSong(
        currentOnlineSong.value,
        currentPlaylistId.value
          ? { fromPlaylistId: currentPlaylistId.value }
          : { queue: currentOnlineQueue.value }
      );
    }
  }

  function showImmersive() {
    if (currentOnlineSong.value || currentMusic.value) {
      viewStore.showImmersive();
    }
  }

  function exitImmersive() {
    viewStore.exitImmersive();
  }

  /** 仅同步播放状态（由托盘等外部触发播放/暂停时调用，不发起后端请求） */
  function syncPlaybackStateFromTray(playing: boolean) {
    if (!hasCurrentTrack.value) return;
    isPlaying.value = playing;
    if (playing) {
      startPlayTimeTracking();
    } else {
      stopPlayTimeTracking();
    }
  }

  async function syncProgressFromBackend() {
    try {
      const progress = await getPlaybackState();
      updateProgressFromBackend(progress);
    } catch (error) {
      console.error("[播放控制] 获取进度失败:", error);
    }
  }

  async function seekToPosition(positionMs: number) {
    try {
      const result = await seekTo(positionMs);
      if (result.should_play_next) {
        await playNextOrPreviousMusic(getPlayStep(1));
        return;
      }
      if (result.success) {
        playbackClock.setPosition(clampPlayTime(positionMs));
      } else {
        await syncProgressFromBackend();
      }
    } catch (error) {
      console.error("[播放控制] 跳转失败:", error);
      await syncProgressFromBackend();
    }
  }

  return {
    playMode,
    currentMusic,
    currentOnlineSong,
    isPlaying,
    isLoadingSong,
    currentPlayTime,
    volume,
    currentPlaylistId,
    currentOnlineQueue,

    hasCurrentTrack,
    currentTrackDuration,
    currentTrackInfo,

    startPlayTimeTracking,
    stopPlayTimeTracking,
    startPlaybackEventListening,
    stopPlaybackEventListening,
    playMusic,
    playOnlineSong,
    prefetchOnlineSong,
    playFromPlaylist,
    togglePlay,
    adjustVolume,
    syncVolumeToBackend,
    playNextOrPreviousMusic,
    getPlayStep,
    togglePlayMode,
    replayCurrentSong,
    showImmersive,
    exitImmersive,
    syncPlaybackStateFromTray,
    syncProgressFromBackend,
    seekToPosition,
  };
});

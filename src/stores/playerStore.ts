import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  MusicFile,
  PlaybackPhase,
  PlaybackQueueItem,
  SongInfo,
} from "@/types/model";
import { PlayMode } from "@/types/model";
import { i18n } from "@/i18n";
import { STORAGE_KEY_PLAY_MODE } from "@/constants";
import { parseErrorMessage } from "@/utils/errorUtils";
import { joinPathSegment } from "@/utils/pathUtils";
import { getLocalMusicDisplayInfo } from "@/utils/songUtils";
import {
  getPlaybackStep,
  getSequentialIndex,
  playFromQueueWithSkip,
  MAX_CONSECUTIVE_SKIPS,
  type PlaybackAttempt,
  type SkipResult,
} from "@/utils/playbackQueue";
import { alignShuffleCursor, stepShuffle } from "@/utils/shuffleHistory";
import {
  handleEvent,
  playNeteaseSong,
  playTrack,
  preparePlaybackRequest,
  prefetchNeteaseSong,
  getPlaybackState,
  seekTo,
} from "@/api/commands/music";
import { usePlaybackClock } from "@/composables/usePlaybackClock";
import { usePlaybackQueue, type PlayOnlineOptions } from "@/composables/usePlaybackQueue";
import { usePlaybackVolume } from "@/composables/usePlaybackVolume";
import { useViewStore } from "./viewStore";
import { useLocalMusicStore } from "./localMusicStore";
import { useOnlineServiceStore } from "./onlineServiceStore";
import { usePlaylistStore } from "./playlistStore";

function debugPlaybackLog(message: string) {
  if (import.meta.env.DEV) console.debug(message);
}

function getLocalTrackKey(file: MusicFile): string {
  return file.relative_path || file.file_name;
}

/** 读取持久化的播放模式；值不可识别（改过 localStorage、旧版本遗留）时回到顺序播放。 */
function readStoredPlayMode(): PlayMode {
  const stored = localStorage.getItem(STORAGE_KEY_PLAY_MODE);
  return Object.values(PlayMode).includes(stored as PlayMode)
    ? (stored as PlayMode)
    : PlayMode.SEQUENTIAL;
}

interface PlaybackEndedPayload {
  position_ms: number;
  duration_ms: number;
  track_id: number;
}

interface PlaybackSnapshot {
  music: MusicFile | null;
  onlineSong: SongInfo | null;
  localQueue: MusicFile[];
  onlineQueue: SongInfo[];
  playlistId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  backendTrackId: number;
}

interface PlayLocalOptions {
  fromPlaylistId?: string;
  queue?: MusicFile[];
}

export const usePlayerStore = defineStore("player", () => {
  const viewStore = useViewStore();
  const localStore = useLocalMusicStore();
  const onlineServiceStore = useOnlineServiceStore();
  const playlistStore = usePlaylistStore();

  // 播放模式跨会话保留。原来每次启动都退回「顺序播放」，
  // 习惯随机或单曲循环的用户每次都得重新点一遍。
  const playMode = ref<PlayMode>(readStoredPlayMode());

  const currentMusic = ref<MusicFile | null>(null);
  const currentOnlineSong = ref<SongInfo | null>(null);
  const isPlaying = ref(false);
  const isLoadingSong = ref(false);
  const playbackPhase = ref<PlaybackPhase>("idle");
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
  // 时间基准避免 WebView/HMR 重载后编号回到 1，与仍在运行的 Rust 状态冲突。
  // 乘以 1000 为同一毫秒内的连续切歌预留递增空间，数值仍在 JS 安全整数范围内。
  let playbackRequestId = Date.now() * 1000;
  let fallbackPlaybackSnapshot: PlaybackSnapshot | null = null;
  /** 当前从播放列表播放时记录列表 id，用于上一曲/下一曲 */
  const currentPlaylistId = ref<string | null>(null);

  const playbackVolume = usePlaybackVolume({
    setBackendVolume: (nextVolume) => handleEvent("volume", { volume: nextVolume }),
  });
  const { volume, adjustVolume, syncVolumeToBackend } = playbackVolume;

  const playbackQueue = usePlaybackQueue({
    getPlayMode: () => playMode.value,
    getCurrentPlaylistId: () => currentPlaylistId.value,
    setCurrentPlaylistId: (id) => {
      currentPlaylistId.value = id;
    },
    getPlaylist: playlistStore.getPlaylist,
    prefetchOnlineSong: prefetchNeteaseSong,
  });
  const currentLocalQueue = ref<MusicFile[]>([]);
  const currentOnlineQueue = playbackQueue.currentOnlineQueue;

  const hasCurrentTrack = computed(
    () => currentMusic.value !== null || currentOnlineSong.value !== null
  );
  const localMusicByFileName = computed(() => localStore.musicFilesByName);

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

  const playbackQueueItems = computed<PlaybackQueueItem[]>(() => {
    if (currentPlaylistId.value) {
      const playlist = playlistStore.getPlaylist(currentPlaylistId.value);
      return (playlist?.items ?? []).map((item, sourceIndex) => {
        if (item.type === "online") {
          return {
            key: `online:${sourceIndex}:${item.song.id}`,
            title: item.song.name,
            artist: item.song.artists.join(", "),
            sourceIndex,
            isCurrent: currentOnlineSong.value?.id === item.song.id,
            coverUrl: item.song.pic_url,
          };
        }
        const file = localMusicByFileName.value.get(item.file_name);
        const display = getLocalMusicDisplayInfo(
          file ?? { id: -1, file_name: item.file_name },
          i18n.global.t("common.unknownArtist")
        );
        return {
          key: `local:${sourceIndex}:${item.file_name}`,
          title: display.title,
          artist: display.artist,
          sourceIndex,
          isCurrent: currentMusic.value?.file_name === item.file_name,
          disabled: !file,
          coverFileName: item.file_name,
        };
      });
    }

    if (currentMusic.value) {
      const queue = currentLocalQueue.value.length
        ? currentLocalQueue.value
        : localStore.musicFiles;
      return queue.map((file, sourceIndex) => {
        const display = getLocalMusicDisplayInfo(
          file,
          i18n.global.t("common.unknownArtist")
        );
        return {
          key: `local:${getLocalTrackKey(file)}`,
          title: display.title,
          artist: display.artist,
          sourceIndex,
          isCurrent: getLocalTrackKey(file) === getLocalTrackKey(currentMusic.value!),
          coverFileName: file.file_name,
        };
      });
    }

    return currentOnlineQueue.value.map((song, sourceIndex) => ({
      key: `online:${song.id}`,
      title: song.name,
      artist: song.artists.join(", "),
      sourceIndex,
      isCurrent: currentOnlineSong.value?.id === song.id,
      coverUrl: song.pic_url,
    }));
  });

  const playbackQueueTitle = computed(() => {
    if (currentPlaylistId.value) {
      return playlistStore.getPlaylist(currentPlaylistId.value)?.name ?? "";
    }
    return currentMusic.value
      ? i18n.global.t("common.localMusic")
      : i18n.global.t("onlineMusic.title");
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
      localQueue: [...currentLocalQueue.value],
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
    currentLocalQueue.value = snapshot.localQueue;
    currentOnlineQueue.value = snapshot.onlineQueue;
    currentPlaylistId.value = snapshot.playlistId;
    currentPlayTime.value = snapshot.positionMs;
    currentTrackDurationMs.value = snapshot.durationMs;
    currentBackendTrackId.value = snapshot.backendTrackId;
    isPlaying.value = snapshot.isPlaying;
    isLoadingSong.value = false;
    playbackPhase.value = "idle";
    if (snapshot.isPlaying && (snapshot.music || snapshot.onlineSong)) {
      startPlayTimeTracking();
    } else {
      stopPlayTimeTracking();
    }
  }

  function beginPlaybackRequest(): number {
    if (!isLoadingSong.value || fallbackPlaybackSnapshot === null) {
      fallbackPlaybackSnapshot = capturePlaybackSnapshot();
    }
    playbackRequestId = Math.max(playbackRequestId + 1, Date.now() * 1000);
    isLoadingSong.value = true;
    isPlaying.value = false;
    stopPlayTimeTracking();
    resetProgressState();
    return playbackRequestId;
  }

  function isCurrentPlaybackRequest(requestId: number): boolean {
    return requestId === playbackRequestId;
  }

  function completePlaybackRequest(requestId: number): boolean {
    if (!isCurrentPlaybackRequest(requestId)) return false;
    isLoadingSong.value = false;
    playbackPhase.value = "idle";
    fallbackPlaybackSnapshot = null;
    return true;
  }

  function failPlaybackRequest(requestId: number) {
    if (!isCurrentPlaybackRequest(requestId)) return;
    const snapshot = fallbackPlaybackSnapshot;
    fallbackPlaybackSnapshot = null;
    if (snapshot) restorePlaybackSnapshot(snapshot);
    else {
      isLoadingSong.value = false;
      playbackPhase.value = "idle";
    }
  }

  function isSupersededPlaybackRequest(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("playback request superseded");
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

  async function playMusic(
    music: MusicFile,
    options?: PlayLocalOptions
  ): Promise<PlaybackAttempt> {
    const requestId = beginPlaybackRequest();
    try {
      if (options?.fromPlaylistId) {
        currentPlaylistId.value = options.fromPlaylistId;
        currentLocalQueue.value = [];
      } else {
        currentPlaylistId.value = null;
        const nextQueue = options?.queue ?? currentLocalQueue.value;
        currentLocalQueue.value = nextQueue.some(
          (item) => getLocalTrackKey(item) === getLocalTrackKey(music)
        )
          ? [...nextQueue]
          : [...localStore.musicFiles];
      }
      playbackQueue.clearOnlineQueue();
      debugPlaybackLog(`[播放控制] 开始播放本地音乐: ${music.file_name}`);

      currentMusic.value = music;
      currentOnlineSong.value = null;
      playbackPhase.value = "buffering";
      await preparePlaybackRequest(requestId);
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";

      const fullPath = joinPathSegment(localStore.currentDirectory, music.file_name);
      const playResult = await playTrack({ type: "local", path: fullPath }, requestId);
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";
      currentBackendTrackId.value = playResult.track_id;
      updateProgressFromBackend(playResult);

      if (!completePlaybackRequest(requestId)) return "aborted";
      isPlaying.value = true;
      startPlayTimeTracking();

      debugPlaybackLog(`[播放控制] 本地音乐播放成功: ${music.file_name}`);
      return "played";
    } catch (error) {
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";
      if (isSupersededPlaybackRequest(error)) {
        debugPlaybackLog("[播放控制] 播放请求已被更新请求替代");
        failPlaybackRequest(requestId);
        return "aborted";
      }
      console.error("[播放控制] 播放本地音乐失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.playFailed")}: ${parseErrorMessage(error)}`
      );
      failPlaybackRequest(requestId);
      return "failed";
    }
  }

  async function playOnlineSong(
    song: SongInfo,
    options?: PlayOnlineOptions
  ): Promise<PlaybackAttempt> {
    if (
      currentOnlineSong.value?.id === song.id &&
      isPlaying.value &&
      !isLoadingSong.value
    ) {
      playbackQueue.applyOnlinePlaybackContext(song, options);
      void playbackQueue.prefetchNextOnlineSong(song);
      debugPlaybackLog("[播放控制] 歌曲正在播放，忽略重复请求");
      return "played";
    }

    const requestId = beginPlaybackRequest();
    try {
      playbackQueue.applyOnlinePlaybackContext(song, options);

      debugPlaybackLog(
        `[播放控制] 开始播放在线歌曲: ${song.name} - ${song.artists.join(", ")}`
      );

      currentOnlineSong.value = song;
      currentMusic.value = null;
      currentLocalQueue.value = [];
      playbackPhase.value = "resolving";
      await preparePlaybackRequest(requestId);
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";
      try {
        await onlineServiceStore.ensureStarted();
      } catch (serviceError) {
        // 单独处理：这是在线播放最常见的失败原因，值得一句能指导下一步的
        // 文案（去点头部的服务状态圆点）。丢给通用兜底只会显示成
        // "播放失败: 未知错误"。返回 aborted 而不是 failed，因为服务没恢复
        // 之前试剩下的曲目只会把同一句提示重复六遍，还会反复触发重连。
        console.error("[播放控制] 在线服务不可用:", serviceError);
        if (!isCurrentPlaybackRequest(requestId)) return "aborted";
        ElMessage.error(i18n.global.t("onlineService.unavailable"));
        failPlaybackRequest(requestId);
        return "aborted";
      }
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";

      const playResult = await playNeteaseSong({
        id: song.id,
        name: song.name,
        artist: song.artists.join(", "),
        picUrl: song.pic_url || undefined,
      });
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";

      debugPlaybackLog("[播放控制] 获取到播放URL，准备播放");
      playbackPhase.value = "buffering";
      const startResult = await playTrack(
        {
          type: "online",
          url: playResult.url,
          cache_key: song.id,
        },
        requestId
      );
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";
      currentBackendTrackId.value = startResult.track_id;
      updateProgressFromBackend(startResult);

      if (!completePlaybackRequest(requestId)) return "aborted";
      isPlaying.value = true;
      startPlayTimeTracking();

      if (playResult.pic_url && currentOnlineSong.value) {
        currentOnlineSong.value.pic_url = playResult.pic_url;
      }
      debugPlaybackLog(`[播放控制] 在线歌曲播放成功: ${song.name}`);
      void playbackQueue.prefetchNextOnlineSong(song);
      return "played";
    } catch (error) {
      if (!isCurrentPlaybackRequest(requestId)) return "aborted";
      if (isSupersededPlaybackRequest(error)) {
        debugPlaybackLog("[播放控制] 在线播放请求已被更新请求替代");
        failPlaybackRequest(requestId);
        return "aborted";
      }
      console.error("[播放控制] 播放在线歌曲失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.playFailedOnline")}: ${parseErrorMessage(error)}`
      );
      failPlaybackRequest(requestId);
      return "failed";
    }
  }

  async function playFromPlaylist(
    playlistId: string,
    index: number
  ): Promise<PlaybackAttempt> {
    const list = playlistStore.getPlaylist(playlistId);
    if (!list || index < 0 || index >= list.items.length) return "failed";
    const item = list.items[index];
    if (item.type === "local") {
      const file = localMusicByFileName.value.get(item.file_name);
      if (!file) {
        ElMessage.warning(i18n.global.t("messages.noLocalMusic"));
        return "failed";
      }
      return playMusic(file, { fromPlaylistId: playlistId });
    }
    return playOnlineSong(item.song, { fromPlaylistId: playlistId });
  }

  async function playQueueItem(index: number) {
    if (currentPlaylistId.value) {
      await playFromPlaylist(currentPlaylistId.value, index);
      return;
    }
    if (currentMusic.value) {
      const queue = currentLocalQueue.value.length
        ? currentLocalQueue.value
        : localStore.musicFiles;
      const music = queue[index];
      if (music) await playMusic(music, { queue });
      return;
    }
    const queue = currentOnlineQueue.value;
    const song = queue[index];
    if (song) await playOnlineSong(song, { queue });
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
      ElMessage.error(
        `${i18n.global.t("errors.togglePlayFailed")}: ${parseErrorMessage(error)}`
      );
    }
  }

  interface ShuffleTarget {
    key: string;
    play: () => Promise<PlaybackAttempt>;
  }

  function alignShuffleHistory(contextKey: string, currentKey: string | null) {
    const contextChanged = shuffleContextKey !== contextKey;
    shuffleContextKey = contextKey;
    const next = alignShuffleCursor(
      { history: shuffleHistory, cursor: shuffleCursor },
      contextChanged,
      currentKey
    );
    shuffleHistory = next.history;
    shuffleCursor = next.cursor;
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
      const queue =
        currentLocalQueue.value.length > 0
          ? currentLocalQueue.value
          : localStore.musicFiles;
      return {
        contextKey: `local:${localStore.currentDirectory ?? "default"}`,
        currentKey: getLocalTrackKey(currentMusic.value),
        targets: queue.map((music) => ({
          key: getLocalTrackKey(music),
          play: () => playMusic(music, { queue }),
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

    // 随机模式同样要跳过放不出来的曲目，否则一首坏的就能让随机播放停住。
    // attempted 记录本次已试过的 key 并交给 stepShuffle 排除——只靠
    // 「选中的 key 会被记进 history」是不够的，原因见 excludedKeys 的注释。
    const attempted = new Set<string>();
    let skipped = 0;

    while (skipped <= MAX_CONSECUTIVE_SKIPS) {
      const step = stepShuffle({
        direction,
        history: shuffleHistory,
        cursor: shuffleCursor,
        currentKey,
        availableKeys: new Set(targets.map((target) => target.key)),
        excludedKeys: attempted,
      });

      shuffleHistory = step.history;
      shuffleCursor = step.cursor;

      if (step.key === null) break;
      const target = targets.find((item) => item.key === step.key);
      if (!target) break;

      attempted.add(step.key);
      const result = await target.play();
      if (result === "played") {
        if (skipped > 0) {
          ElMessage.warning(
            i18n.global.t("messages.skippedUnplayable", { count: skipped })
          );
        }
        return;
      }
      if (result === "aborted") return;
      skipped += 1;
    }
    // 一首都没试过（队列里除了当前曲目没有别的可选）时保持静默，
    // 与 stepShuffle 原本返回 null 的语义一致。
    if (skipped > 0) ElMessage.error(i18n.global.t("errors.noPlayableTrack"));
  }

  function reportSkipResult(result: SkipResult) {
    // 已被中止：要么有更新的播放请求接手、要么原因已经就地提示过，
    // 两种情况都不该再补一句。
    if (result.aborted) return;
    if (result.played) {
      if (result.skipped > 0) {
        ElMessage.warning(
          i18n.global.t("messages.skippedUnplayable", { count: result.skipped })
        );
      }
      return;
    }
    ElMessage.error(i18n.global.t("errors.noPlayableTrack"));
  }

  async function playNextOrPreviousMusic(step: number) {
    try {
      if (playMode.value === PlayMode.RANDOM) {
        await playRandomWithHistory(step);
        return;
      }

      const direction = step > 0 ? "下" : "上";
      debugPlaybackLog(`[播放控制] 准备播放${direction}一首歌曲`);

      if (currentPlaylistId.value) {
        const playlistId = currentPlaylistId.value;
        const list = playlistStore.getPlaylist(playlistId);
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
          reportSkipResult(
            await playFromQueueWithSkip(
              list.items.length,
              getSequentialIndex(currentIndex, step, list.items.length),
              step,
              (index) => playFromPlaylist(playlistId, index)
            )
          );
          return;
        }
        currentPlaylistId.value = null;
      }

      if (currentMusic.value) {
        const queue =
          currentLocalQueue.value.length > 0
            ? currentLocalQueue.value
            : localStore.musicFiles;
        if (queue.length === 0) {
          ElMessage.warning(i18n.global.t("messages.noLocalMusic"));
          return;
        }

        let currentIndex = queue.findIndex(
          (file) =>
            currentMusic.value !== null &&
            getLocalTrackKey(file) === getLocalTrackKey(currentMusic.value)
        );
        if (currentIndex === -1) currentIndex = 0;

        reportSkipResult(
          await playFromQueueWithSkip(
            queue.length,
            getSequentialIndex(currentIndex, step, queue.length),
            step,
            (index) => playMusic(queue[index], { queue })
          )
        );
      } else if (currentOnlineSong.value) {
        const queue = playbackQueue.getActiveOnlineQueue();
        if (queue.length === 0) {
          ElMessage.warning(i18n.global.t("messages.noOnlineMusic"));
          return;
        }

        let currentIndex = queue.findIndex(
          (song) => song.id === currentOnlineSong.value?.id
        );
        if (currentIndex === -1) currentIndex = 0;

        reportSkipResult(
          await playFromQueueWithSkip(
            queue.length,
            getSequentialIndex(currentIndex, step, queue.length),
            step,
            (index) => playOnlineSong(queue[index], { queue })
          )
        );
      }
    } catch (error) {
      console.error(`[播放控制] 播放${step > 0 ? "下" : "上"}一首失败:`, error);
      ElMessage.error(
        `${i18n.global.t("errors.switchFailed")}: ${parseErrorMessage(error)}`
      );
    }
  }

  function getCurrentStepListLength(): number {
    if (currentPlaylistId.value) {
      const list = playlistStore.getPlaylist(currentPlaylistId.value);
      return list?.items.length ?? 0;
    }
    if (currentMusic.value) {
      return currentLocalQueue.value.length || localStore.musicFiles.length;
    }
    if (currentOnlineSong.value) return playbackQueue.getActiveOnlineQueue().length;
    return 0;
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
    localStorage.setItem(STORAGE_KEY_PLAY_MODE, playMode.value);
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
        currentPlaylistId.value
          ? { fromPlaylistId: currentPlaylistId.value }
          : { queue: currentLocalQueue.value }
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
    playbackPhase,
    currentPlayTime,
    volume,
    currentPlaylistId,
    currentLocalQueue,
    currentOnlineQueue,

    hasCurrentTrack,
    currentTrackDuration,
    currentTrackInfo,
    playbackQueueItems,
    playbackQueueTitle,

    startPlayTimeTracking,
    stopPlayTimeTracking,
    startPlaybackEventListening,
    stopPlaybackEventListening,
    playMusic,
    playOnlineSong,
    prefetchOnlineSong,
    playFromPlaylist,
    playQueueItem,
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

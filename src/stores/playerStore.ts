import { ref, computed, watch } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type {
  MusicFile,
  PlaybackPhase,
  PlaybackQueueItem,
  PlaylistItem,
  SongInfo,
} from "@/types/model";
import { PlayMode } from "@/types/model";
import { i18n } from "@/i18n";
import {
  PLAYER_SESSION_QUEUE_LIMIT,
  PLAYER_SESSION_VERSION,
  PLAYER_SESSION_WRITE_INTERVAL_MS,
  STORAGE_KEY_PLAY_MODE,
} from "@/constants";
import { parseErrorMessage } from "@/utils/errorUtils";
import { joinPathSegment } from "@/utils/pathUtils";
import { formatArtists, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import {
  getPlaybackStep,
  getSequentialIndex,
  playFromQueueWithSkip,
  MAX_CONSECUTIVE_SKIPS,
  type PlaybackAttempt,
  type SkipResult,
} from "@/utils/playbackQueue";
import { alignShuffleCursor, stepShuffle } from "@/utils/shuffleHistory";
import { PLAY_MODE_SEQUENCE, playModeLabelKey } from "@/utils/playModeUtils";
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
import { createPlaybackEventListener } from "./player/playbackEvents";
import { createPlaybackRequestController } from "./player/playbackRequest";
import {
  clearPlayerSession,
  readPlayerSession,
  windowQueue,
  writePlayerSession,
  type PlayerSessionSnapshot,
} from "./player/sessionPersistence";
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

interface PlayLocalOptions {
  fromPlaylistId?: string;
  queue?: MusicFile[];
  /** 失败时不弹提示。只给跳过链用，理由见 PlayOnlineOptions.quiet。 */
  quiet?: boolean;
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
  /**
   * 会话恢复后、真正开始播放前为 true。
   *
   * 恢复出来的曲目只是「摆在那里的记录」——后端 sink 里没有它。此时点播放
   * 不能走 handleEvent("recovery")（那是在已加载的音频上继续），必须先按
   * 正常路径重新加载，再 seek 回保存的位置。
   */
  const sessionResumePending = ref(false);
  let handlingEndedTrackId = 0;
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
        artist: formatArtists(currentOnlineSong.value.artists),
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
            artist: formatArtists(item.song.artists),
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
      artist: formatArtists(song.artists),
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

  const playbackRequest = createPlaybackRequestController({
    currentMusic,
    currentOnlineSong,
    currentLocalQueue,
    currentOnlineQueue,
    currentPlaylistId,
    isPlaying,
    isLoadingSong,
    playbackPhase,
    currentPlayTime,
    currentTrackDurationMs,
    currentBackendTrackId,
    startPlayTimeTracking,
    stopPlayTimeTracking,
  });

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
    // 0 表示后端还没能确定这首的时长（例如边下边播的流）：此时必须清掉旧值，
    // 让 currentTrackDuration 落到曲目元数据的兜底上。留着上一首的时长会让
    // 进度条一直停在上一首的长度上。
    currentTrackDurationMs.value = progress.duration_ms;
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

  const playbackEvents = createPlaybackEventListener({
    getCurrentTrackId: () => currentBackendTrackId.value,
    onProgress: updateProgressFromBackend,
    onEnded: handlePlaybackEnded,
  });

  async function startPlaybackEventListening() {
    return playbackEvents.start();
  }

  function stopPlaybackEventListening() {
    playbackEvents.stop();
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
      // 与 updateProgressFromBackend 同一策略：0 = 后端还没确定时长，清掉旧值
      currentTrackDurationMs.value = durationMs;
    },
    shouldAcceptState: (state) =>
      // 切歌窗口内（isLoadingSong）后端状态不可信：它可能还描述着上一首，
      // 或正处在 clear 与 append 之间（sink 为空、位置仍是上一首的）。
      // 此时写回会让进度条停在上一首的位置/时长上。
      !isLoadingSong.value &&
      (currentBackendTrackId.value === 0 ||
        state.track_id === currentBackendTrackId.value),
    onEnded: handlePlaybackEnded,
  });

  // 队列是「开始播放那一刻」的快照。曲库变了（删歌、重新扫描）之后，快照里可能
  // 留着已经不在磁盘上的文件——「下一首」撞上它、失败、再跳过，用户看到两条
  // 弹窗说同一件事，而他只是按了一下下一首。
  //
  // 摘掉的只是队列里的引用：正在播的那一首不动（音频已经在内存里，让它放完比
  // 半路掐断自然），而它之后「下一首」不会再撞上不存在的东西。
  watch(
    () => localStore.musicFiles,
    (files) => {
      if (currentLocalQueue.value.length === 0) return;
      const alive = new Set(files.map(getLocalTrackKey));
      const pruned = currentLocalQueue.value.filter((file) =>
        alive.has(getLocalTrackKey(file))
      );
      if (pruned.length !== currentLocalQueue.value.length) {
        currentLocalQueue.value = pruned;
      }
    }
  );

  // isPlaying 与时钟保持同步：任何路径把状态置为「播放中」，时钟都必须跑起来；
  // 反之停表。这样即便某条异常路径漏了 start/stop（或被取代的播放请求中途返回），
  // 也不会出现「歌在放、进度条冻结」。
  watch(isPlaying, (playing) => {
    if (playing) startPlayTimeTracking();
    else stopPlayTimeTracking();
  });

  // ---------- 播放会话：恢复与持久化 ----------

  function buildSessionSnapshot(): PlayerSessionSnapshot | null {
    if (!hasCurrentTrack.value) return null;

    const localKey = currentMusic.value ? getLocalTrackKey(currentMusic.value) : null;
    let localQueueKeys: string[] = [];
    if (localKey && currentLocalQueue.value.length > 0) {
      const keys = currentLocalQueue.value.map(getLocalTrackKey);
      localQueueKeys = windowQueue(
        keys,
        keys.indexOf(localKey),
        PLAYER_SESSION_QUEUE_LIMIT
      );
    }

    // 歌单上下文不存队列：恢复时按 playlistId 从歌单现算，歌单本身有持久化。
    let onlineQueue: SongInfo[] = [];
    if (currentOnlineSong.value && !currentPlaylistId.value) {
      const queue = currentOnlineQueue.value.length
        ? currentOnlineQueue.value
        : [currentOnlineSong.value];
      const index = queue.findIndex((song) => song.id === currentOnlineSong.value?.id);
      onlineQueue = windowQueue(queue, index, PLAYER_SESSION_QUEUE_LIMIT);
    }

    return {
      version: PLAYER_SESSION_VERSION,
      positionMs: currentPlayTime.value,
      playlistId: currentPlaylistId.value,
      localKey,
      onlineSong: currentOnlineSong.value,
      localQueueKeys,
      onlineQueue,
    };
  }

  let lastSessionWriteAt = 0;

  /** 播放进度每 250ms 变化一次，按节流写盘；切歌/暂停等节点用 force 立即写。 */
  function persistSession(force = false) {
    const now = Date.now();
    if (!force && now - lastSessionWriteAt < PLAYER_SESSION_WRITE_INTERVAL_MS) return;
    lastSessionWriteAt = now;

    const snapshot = buildSessionSnapshot();
    if (!snapshot) {
      clearPlayerSession();
      return;
    }
    writePlayerSession(snapshot);
  }

  function restoreSession(): boolean {
    const session = readPlayerSession();
    if (!session) return false;

    if (session.playlistId) {
      const playlist = playlistStore.getPlaylist(session.playlistId);
      currentPlaylistId.value = playlist ? playlist.id : null;
    } else {
      currentPlaylistId.value = null;
    }

    if (session.localKey) {
      const file = localStore.musicFiles.find(
        (candidate) => getLocalTrackKey(candidate) === session.localKey
      );
      // 上次放的文件已经不在曲库里（被删/换了曲库目录）：没有可恢复的东西。
      if (!file) {
        clearPlayerSession();
        return false;
      }
      if (!currentPlaylistId.value) {
        const byKey = new Map(
          localStore.musicFiles.map((item) => [getLocalTrackKey(item), item])
        );
        currentLocalQueue.value = session.localQueueKeys
          .map((key) => byKey.get(key))
          .filter((item): item is MusicFile => Boolean(item));
      }
      currentMusic.value = file;
      currentOnlineSong.value = null;
      currentTrackDurationMs.value = Math.max(0, file.duration_ms ?? 0);
    } else if (session.onlineSong) {
      currentOnlineSong.value = session.onlineSong;
      currentMusic.value = null;
      currentLocalQueue.value = [];
      if (!currentPlaylistId.value) {
        currentOnlineQueue.value = session.onlineQueue.length
          ? session.onlineQueue
          : [session.onlineSong];
      }
      currentTrackDurationMs.value = Math.max(0, session.onlineSong.duration ?? 0);
    } else {
      return false;
    }

    // 恢复是「记起来」，不是「接着放」：不碰后端，等用户按播放。
    isPlaying.value = false;
    playbackPhase.value = "idle";
    currentBackendTrackId.value = 0;
    currentPlayTime.value = 0;
    sessionResumePending.value = true;
    if (session.positionMs > 0) currentPlayTime.value = clampPlayTime(session.positionMs);

    debugPlaybackLog(
      `[播放控制] 已恢复上次会话：${
        currentMusic.value?.file_name ?? currentOnlineSong.value?.name ?? ""
      } @ ${Math.round(currentPlayTime.value)}ms`
    );
    return true;
  }

  /** 恢复出来的曲目首次播放：重新加载音频，再跳回保存的位置。 */
  async function resumeRestoredTrack() {
    const targetPosition = clampPlayTime(currentPlayTime.value);
    const playlistId = currentPlaylistId.value;
    let attempt: PlaybackAttempt = "failed";

    if (currentMusic.value) {
      attempt = await playMusic(
        currentMusic.value,
        playlistId ? { fromPlaylistId: playlistId } : { queue: currentLocalQueue.value }
      );
    } else if (currentOnlineSong.value) {
      attempt = await playOnlineSong(
        currentOnlineSong.value,
        playlistId ? { fromPlaylistId: playlistId } : { queue: currentOnlineQueue.value }
      );
    }

    if (attempt === "played") {
      if (targetPosition > 0) await seekToPosition(targetPosition);
      return;
    }
    // 失败后保留待恢复标记：用户再点一次播放应该重试，而不是对空气恢复。
    if (attempt === "failed") sessionResumePending.value = true;
  }

  watch(currentPlayTime, () => persistSession());
  watch([currentMusic, currentOnlineSong, currentPlaylistId], () => persistSession(true));
  watch([currentLocalQueue, currentOnlineQueue], () => persistSession(true));
  watch(isPlaying, () => persistSession(true));

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
    sessionResumePending.value = false;
    const requestId = playbackRequest.begin();
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
      if (!playbackRequest.isCurrent(requestId)) return "aborted";

      const fullPath = joinPathSegment(localStore.currentDirectory, music.file_name);
      const playResult = await playTrack({ type: "local", path: fullPath }, requestId);
      if (!playbackRequest.isCurrent(requestId)) return "aborted";
      currentBackendTrackId.value = playResult.track_id;
      updateProgressFromBackend(playResult);

      if (!playbackRequest.complete(requestId)) return "aborted";
      isPlaying.value = true;
      startPlayTimeTracking();

      debugPlaybackLog(`[播放控制] 本地音乐播放成功: ${music.file_name}`);
      return "played";
    } catch (error) {
      if (!playbackRequest.isCurrent(requestId)) return "aborted";
      if (playbackRequest.isSuperseded(error)) {
        debugPlaybackLog("[播放控制] 播放请求已被更新请求替代");
        playbackRequest.fail(requestId);
        return "aborted";
      }
      console.error("[播放控制] 播放本地音乐失败:", error);
      if (!options?.quiet) {
        ElMessage.error(
          `${i18n.global.t("errors.playFailed")}: ${parseErrorMessage(error)}`
        );
      }
      playbackRequest.fail(requestId);
      return "failed";
    }
  }

  async function playOnlineSong(
    song: SongInfo,
    options?: PlayOnlineOptions
  ): Promise<PlaybackAttempt> {
    sessionResumePending.value = false;
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

    const requestId = playbackRequest.begin();
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
      if (!playbackRequest.isCurrent(requestId)) return "aborted";
      try {
        await onlineServiceStore.ensureStarted();
      } catch (serviceError) {
        // 单独处理：这是在线播放最常见的失败原因，值得一句能指导下一步的
        // 文案（去点头部的服务状态圆点）。丢给通用兜底只会显示成
        // "播放失败: 未知错误"。返回 aborted 而不是 failed，因为服务没恢复
        // 之前试剩下的曲目只会把同一句提示重复六遍，还会反复触发重连。
        console.error("[播放控制] 在线服务不可用:", serviceError);
        if (!playbackRequest.isCurrent(requestId)) return "aborted";
        ElMessage.error(i18n.global.t("onlineService.unavailable"));
        playbackRequest.fail(requestId);
        return "aborted";
      }
      if (!playbackRequest.isCurrent(requestId)) return "aborted";

      const playResult = await playNeteaseSong({
        id: song.id,
        name: song.name,
        artist: song.artists.join(", "),
        picUrl: song.pic_url || undefined,
      });
      if (!playbackRequest.isCurrent(requestId)) return "aborted";

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
      if (!playbackRequest.isCurrent(requestId)) return "aborted";
      currentBackendTrackId.value = startResult.track_id;
      updateProgressFromBackend(startResult);

      if (!playbackRequest.complete(requestId)) return "aborted";
      isPlaying.value = true;
      startPlayTimeTracking();

      if (playResult.pic_url && currentOnlineSong.value) {
        currentOnlineSong.value.pic_url = playResult.pic_url;
      }
      debugPlaybackLog(`[播放控制] 在线歌曲播放成功: ${song.name}`);
      void playbackQueue.prefetchNextOnlineSong(song);
      return "played";
    } catch (error) {
      if (!playbackRequest.isCurrent(requestId)) return "aborted";
      if (playbackRequest.isSuperseded(error)) {
        debugPlaybackLog("[播放控制] 在线播放请求已被更新请求替代");
        playbackRequest.fail(requestId);
        return "aborted";
      }
      console.error("[播放控制] 播放在线歌曲失败:", error);
      if (!options?.quiet) {
        ElMessage.error(
          `${i18n.global.t("errors.playFailedOnline")}: ${parseErrorMessage(error)}`
        );
      }
      playbackRequest.fail(requestId);
      return "failed";
    }
  }

  async function playFromPlaylist(
    playlistId: string,
    index: number,
    quiet = false
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
      return playMusic(file, { fromPlaylistId: playlistId, quiet });
    }
    return playOnlineSong(item.song, { fromPlaylistId: playlistId, quiet });
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

  type NextQueueTarget =
    | { type: "local"; file: MusicFile }
    | { type: "online"; song: SongInfo };

  /**
   * 「下一首播放」：把目标插到当前曲目之后。
   *
   * 语义按当前播放上下文分三种：
   * - 歌单上下文：直接插进歌单（歌单就是持久化的播放顺序），已在列表里则移动；
   * - 本地/在线队列：插进队列快照，已在队列里则先挪位再插；
   * - 没有正在播放的曲目，或目标与当前上下文类型不同（在放本地却要插在线）：
   *   直接播放目标——插到一个不存在的队列里没有意义。
   */
  async function playNextInQueue(target: NextQueueTarget): Promise<boolean> {
    if (!hasCurrentTrack.value) {
      return target.type === "local"
        ? (await playMusic(target.file)) === "played"
        : (await playOnlineSong(target.song)) === "played";
    }

    if (currentPlaylistId.value) {
      const list = playlistStore.getPlaylist(currentPlaylistId.value);
      if (list) {
        const currentIndex = list.items.findIndex((item) =>
          currentMusic.value
            ? item.type === "local" && item.file_name === currentMusic.value.file_name
            : item.type === "online" && item.song.id === currentOnlineSong.value?.id
        );
        const playlistItem: PlaylistItem =
          target.type === "local"
            ? { type: "local", file_name: target.file.file_name }
            : { type: "online", song: target.song };
        playlistStore.insertIntoPlaylist(
          list.id,
          currentIndex === -1 ? 0 : currentIndex + 1,
          playlistItem
        );
        ElMessage.success(i18n.global.t("messages.playNext"));
        return true;
      }
    }

    if (currentMusic.value) {
      // 在放本地、目标是在线：切换到在线上下文并直接播它
      if (target.type !== "local") {
        return (await playOnlineSong(target.song, { queue: [target.song] })) === "played";
      }
      const queue = currentLocalQueue.value.length
        ? [...currentLocalQueue.value]
        : [...localStore.musicFiles];
      const currentIndex = queue.findIndex(
        (file) =>
          currentMusic.value !== null &&
          getLocalTrackKey(file) === getLocalTrackKey(currentMusic.value)
      );
      const existingIndex = queue.findIndex(
        (file) => getLocalTrackKey(file) === getLocalTrackKey(target.file)
      );
      if (existingIndex !== -1) queue.splice(existingIndex, 1);
      const insertAfter =
        currentIndex === -1
          ? 0
          : existingIndex !== -1 && existingIndex < currentIndex
            ? currentIndex - 1
            : currentIndex;
      queue.splice(insertAfter + 1, 0, target.file);
      currentLocalQueue.value = queue;
      ElMessage.success(i18n.global.t("messages.playNext"));
      return true;
    }

    if (currentOnlineSong.value) {
      if (target.type !== "online") {
        return (await playMusic(target.file, { queue: [target.file] })) === "played";
      }
      const queue = currentOnlineQueue.value.length
        ? [...currentOnlineQueue.value]
        : [currentOnlineSong.value];
      const currentIndex = queue.findIndex(
        (song) => song.id === currentOnlineSong.value?.id
      );
      const existingIndex = queue.findIndex((song) => song.id === target.song.id);
      if (existingIndex !== -1) queue.splice(existingIndex, 1);
      const insertAfter =
        currentIndex === -1
          ? 0
          : existingIndex !== -1 && existingIndex < currentIndex
            ? currentIndex - 1
            : currentIndex;
      queue.splice(insertAfter + 1, 0, target.song);
      currentOnlineQueue.value = queue;
      void playbackQueue.prefetchNextOnlineSong(currentOnlineSong.value);
      ElMessage.success(i18n.global.t("messages.playNext"));
      return true;
    }

    return false;
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

      // 恢复出来的曲目还没加载进后端：播放 = 重新加载 + 跳回原位
      if (!isPlaying.value && sessionResumePending.value) {
        await resumeRestoredTrack();
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
              (index) => playFromPlaylist(playlistId, index, true)
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
            (index) => playMusic(queue[index], { queue, quiet: true })
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
            (index) => playOnlineSong(queue[index], { queue, quiet: true })
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
    const currentIndex = PLAY_MODE_SEQUENCE.indexOf(playMode.value);
    const nextIndex = (currentIndex + 1) % PLAY_MODE_SEQUENCE.length;
    playMode.value = PLAY_MODE_SEQUENCE[nextIndex];
    localStorage.setItem(STORAGE_KEY_PLAY_MODE, playMode.value);
    resetShuffleHistory();

    const modeName = i18n.global.t(playModeLabelKey(playMode.value));
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
    // 恢复出来的曲目后端还没有音频：托盘的「播放」也要先加载再放
    if (playing && sessionResumePending.value) {
      void resumeRestoredTrack();
      return;
    }
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
      // 恢复出来的曲目还没加载：只更新显示位置，真正跳转在播放时补上
      if (sessionResumePending.value) {
        currentPlayTime.value = clampPlayTime(positionMs);
        return;
      }
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
    currentBackendTrackId,

    hasCurrentTrack,
    currentTrackDuration,
    currentTrackInfo,
    playbackQueueItems,
    playbackQueueTitle,

    startPlayTimeTracking,
    stopPlayTimeTracking,
    startPlaybackEventListening,
    stopPlaybackEventListening,
    sessionResumePending,
    restoreSession,
    persistSession,
    playMusic,
    playOnlineSong,
    prefetchOnlineSong,
    playFromPlaylist,
    playQueueItem,
    playNextInQueue,
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

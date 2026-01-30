import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { MusicFile, SongInfo } from "@/types/model";
import { PlayMode, ViewMode } from "@/types/model";
import { i18n } from "@/i18n";
import { handleEvent, playNeteaseSong } from "@/api/commands/music";
import { useViewStore } from "./viewStore";
import { useLocalMusicStore } from "./localMusicStore";
import { useOnlineMusicStore } from "./onlineMusicStore";
import { usePlaylistStore } from "./playlistStore";

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
  /** 当前从播放列表播放时记录列表 id，用于上一曲/下一曲 */
  const currentPlaylistId = ref<string | null>(null);

  let playStartTimestamp = 0;
  let playTimeUpdateInterval: number | null = null;

  const hasCurrentTrack = computed(
    () => currentMusic.value !== null || currentOnlineSong.value !== null
  );

  const currentTrackDuration = computed(() => {
    if (currentOnlineSong.value?.duration) return currentOnlineSong.value.duration;
    return 0;
  });

  const currentTrackInfo = computed(() => {
    if (viewStore.viewMode === ViewMode.LOCAL && currentMusic.value) {
      return {
        name: currentMusic.value.file_name,
        artist: "",
        picUrl: "",
      };
    }
    if (
      (viewStore.viewMode === ViewMode.ONLINE ||
        viewStore.viewMode === ViewMode.PLAYLIST) &&
      currentOnlineSong.value
    ) {
      return {
        name: currentOnlineSong.value.name,
        artist: currentOnlineSong.value.artists.join(", "),
        picUrl: currentOnlineSong.value.pic_url || "",
      };
    }
    if (viewStore.viewMode === ViewMode.PLAYLIST && currentMusic.value) {
      return {
        name: currentMusic.value.file_name,
        artist: "",
        picUrl: "",
      };
    }
    return null;
  });

  function startPlayTimeTracking() {
    stopPlayTimeTracking();
    const startOffset = currentPlayTime.value;
    playStartTimestamp = Date.now() - startOffset;
    playTimeUpdateInterval = window.setInterval(() => {
      currentPlayTime.value = Date.now() - playStartTimestamp;
    }, 200);
  }

  function stopPlayTimeTracking() {
    if (playTimeUpdateInterval !== null) {
      if (isPlaying.value && playStartTimestamp !== 0) {
        currentPlayTime.value = Date.now() - playStartTimestamp;
      }
      clearInterval(playTimeUpdateInterval);
      playTimeUpdateInterval = null;
    }
  }

  async function playMusic(music: MusicFile, options?: { fromPlaylistId?: string }) {
    try {
      if (!options?.fromPlaylistId) currentPlaylistId.value = null;
      console.log(`[播放控制] 开始播放本地音乐: ${music.file_name}`);

      isLoadingSong.value = true;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();

      currentMusic.value = music;
      currentOnlineSong.value = null;

      const fullPath = `${localStore.currentDirectory}/${music.file_name}`;
      await handleEvent("play", { path: fullPath });

      await new Promise((resolve) => setTimeout(resolve, 200));

      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      if (options?.fromPlaylistId) currentPlaylistId.value = options.fromPlaylistId;
      ElMessage.success(i18n.global.t("messages.playing", { name: music.file_name }));
      console.log(`[播放控制] 本地音乐播放成功: ${music.file_name}`);
    } catch (error) {
      console.error("[播放控制] 播放本地音乐失败:", error);
      ElMessage.error(`${i18n.global.t("errors.playFailed")}: ${error}`);
      isLoadingSong.value = false;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();
    }
  }

  async function playOnlineSong(song: SongInfo, options?: { fromPlaylistId?: string }) {
    try {
      if (
        currentOnlineSong.value?.id === song.id &&
        isPlaying.value &&
        !isLoadingSong.value
      ) {
        console.log("[播放控制] 歌曲正在播放，忽略重复请求");
        return;
      }
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略重复请求");
        return;
      }
      if (!options?.fromPlaylistId) currentPlaylistId.value = null;

      console.log(
        `[播放控制] 开始播放在线歌曲: ${song.name} - ${song.artists.join(", ")}`
      );

      isLoadingSong.value = true;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();

      currentOnlineSong.value = song;
      currentMusic.value = null;

      const playResult = await playNeteaseSong({
        id: song.id,
        name: song.name,
        artist: song.artists.join(", "),
      });

      console.log("[播放控制] 获取到播放URL，准备播放");
      await handleEvent("play", { path: playResult.url });

      await new Promise((resolve) => setTimeout(resolve, 500));

      isLoadingSong.value = false;
      isPlaying.value = true;
      startPlayTimeTracking();

      if (playResult.pic_url && currentOnlineSong.value) {
        currentOnlineSong.value.pic_url = playResult.pic_url;
      }
      if (options?.fromPlaylistId) currentPlaylistId.value = options.fromPlaylistId;

      ElMessage.success(
        i18n.global.t("messages.playing", {
          name: `${song.name} - ${song.artists.join(", ")}`,
        })
      );
      console.log(`[播放控制] 在线歌曲播放成功: ${song.name}`);
    } catch (error) {
      console.error("[播放控制] 播放在线歌曲失败:", error);
      ElMessage.error(`${i18n.global.t("errors.playFailedOnline")}: ${error}`);
      isLoadingSong.value = false;
      isPlaying.value = false;
      currentPlayTime.value = 0;
      stopPlayTimeTracking();
    }
  }

  async function playFromPlaylist(playlistId: string, index: number) {
    const list = playlistStore.getPlaylist(playlistId);
    if (!list || index < 0 || index >= list.items.length) return;
    const item = list.items[index];
    if (item.type === "local") {
      const file = localStore.musicFiles.find((f) => f.file_name === item.file_name);
      if (file) await playMusic(file, { fromPlaylistId: playlistId });
      else ElMessage.warning(i18n.global.t("messages.noLocalMusic"));
    } else {
      await playOnlineSong(item.song, { fromPlaylistId: playlistId });
    }
  }

  async function togglePlay() {
    try {
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略播放/暂停操作");
        return;
      }
      if (!hasCurrentTrack.value) {
        console.log("[播放控制] 没有当前曲目，忽略播放/暂停操作");
        return;
      }

      console.log(`[播放控制] ${isPlaying.value ? "暂停" : "恢复"}播放`);
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

  async function adjustVolume(volume: number) {
    await handleEvent("volume", { volume });
  }

  async function playNextOrPreviousMusic(step: number) {
    try {
      if (isLoadingSong.value) {
        console.log("[播放控制] 歌曲正在加载中，忽略切换请求");
        return;
      }

      const direction = step > 0 ? "下" : "上";
      console.log(`[播放控制] 准备播放${direction}一首歌曲`);

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
          let nextIndex: number;
          if (playMode.value === PlayMode.RANDOM && list.items.length > 1) {
            const r = Math.floor(Math.random() * (list.items.length - 1)) + 1;
            const effStep = r * (step > 0 ? 1 : -1);
            nextIndex = (currentIndex + effStep) % list.items.length;
            if (nextIndex < 0) nextIndex = list.items.length + nextIndex;
          } else {
            nextIndex = (currentIndex + step) % list.items.length;
            if (nextIndex < 0) nextIndex = list.items.length + nextIndex;
          }
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
          (file) => file.id === currentMusic.value?.id
        );
        if (currentIndex === -1) currentIndex = 0;

        let nextIndex = (currentIndex + step) % localStore.musicFiles.length;
        if (nextIndex < 0) nextIndex = localStore.musicFiles.length + nextIndex;

        await playMusic(localStore.musicFiles[nextIndex]);
      } else {
        if (onlineStore.onlineSongs.length === 0) {
          ElMessage.warning(i18n.global.t("messages.noOnlineMusic"));
          return;
        }

        let currentIndex = onlineStore.onlineSongs.findIndex(
          (song) => song.id === currentOnlineSong.value?.id
        );
        if (currentIndex === -1) currentIndex = 0;

        let nextIndex = (currentIndex + step) % onlineStore.onlineSongs.length;
        if (nextIndex < 0) nextIndex = onlineStore.onlineSongs.length + nextIndex;

        await playOnlineSong(onlineStore.onlineSongs[nextIndex]);
      }
    } catch (error) {
      console.error(`[播放控制] 播放${step > 0 ? "下" : "上"}一首失败:`, error);
      ElMessage.error(`${i18n.global.t("errors.switchFailed")}: ${error}`);
    }
  }

  function getRandomStep(): number {
    if (playMode.value === PlayMode.RANDOM) {
      const currentList =
        viewStore.viewMode === ViewMode.LOCAL
          ? localStore.musicFiles
          : onlineStore.onlineSongs;
      if (currentList.length <= 1) return 1;
      return Math.floor(Math.random() * (currentList.length - 1)) + 1;
    }
    return 1;
  }

  function getPlayStep(direction: number): number {
    if (playMode.value === PlayMode.RANDOM) return getRandomStep();
    return Math.abs(direction);
  }

  function togglePlayMode() {
    playMode.value =
      playMode.value === PlayMode.SEQUENTIAL ? PlayMode.RANDOM : PlayMode.SEQUENTIAL;
    const modeKey =
      playMode.value === PlayMode.SEQUENTIAL
        ? "playerBar.sequential"
        : "playerBar.random";
    const modeName = i18n.global.t(modeKey);
    ElMessage.success(i18n.global.t("messages.playModeSwitch", { mode: modeName }));
  }

  function showImmersive() {
    if (currentOnlineSong.value || currentMusic.value) {
      if (isPlaying.value && playTimeUpdateInterval === null) startPlayTimeTracking();
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

  return {
    playMode,
    currentMusic,
    currentOnlineSong,
    isPlaying,
    isLoadingSong,
    currentPlayTime,
    currentPlaylistId,

    hasCurrentTrack,
    currentTrackDuration,
    currentTrackInfo,

    startPlayTimeTracking,
    stopPlayTimeTracking,
    playMusic,
    playOnlineSong,
    playFromPlaylist,
    togglePlay,
    adjustVolume,
    playNextOrPreviousMusic,
    getRandomStep,
    getPlayStep,
    togglePlayMode,
    showImmersive,
    exitImmersive,
    syncPlaybackStateFromTray,
  };
});

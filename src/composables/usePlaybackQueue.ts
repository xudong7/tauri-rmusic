import { ref } from "vue";
import { PlayMode, type Playlist, type SongInfo } from "@/types/model";

const MAX_PREFETCHED_ONLINE_SONG_IDS = 300;
const MAX_CONCURRENT_ONLINE_PREFETCHES = 2;

export interface PlayOnlineOptions {
  fromPlaylistId?: string;
  queue?: SongInfo[];
}

export function usePlaybackQueue(options: {
  getPlayMode: () => PlayMode;
  getViewMode?: () => unknown;
  getFallbackOnlineQueue?: () => SongInfo[];
  getCurrentPlaylistId: () => string | null;
  setCurrentPlaylistId: (id: string | null) => void;
  getPlaylist: (id: string) => Playlist | undefined;
  prefetchOnlineSong: (id: string) => Promise<void>;
}) {
  const currentOnlineQueue = ref<SongInfo[]>([]);
  const prefetchingOnlineSongIds = new Set<string>();
  const prefetchedOnlineSongIds = new Set<string>();

  function clearOnlineQueue() {
    currentOnlineQueue.value = [];
  }

  function applyOnlinePlaybackContext(playOptions?: PlayOnlineOptions): void;
  function applyOnlinePlaybackContext(
    song: SongInfo,
    playOptions?: PlayOnlineOptions
  ): void;
  function applyOnlinePlaybackContext(
    songOrOptions?: SongInfo | PlayOnlineOptions,
    optionsArg?: PlayOnlineOptions
  ) {
    const song = songOrOptions && "id" in songOrOptions ? songOrOptions : null;
    const playOptions = song
      ? optionsArg
      : (songOrOptions as PlayOnlineOptions | undefined);
    if (playOptions?.fromPlaylistId) {
      options.setCurrentPlaylistId(playOptions.fromPlaylistId);
      currentOnlineQueue.value = [];
      return;
    }

    options.setCurrentPlaylistId(null);
    if (playOptions?.queue) {
      currentOnlineQueue.value = [...playOptions.queue];
    } else if (song && !currentOnlineQueue.value.some((item) => item.id === song.id)) {
      currentOnlineQueue.value = [song];
    }
  }

  function getActiveOnlineQueue(): SongInfo[] {
    return currentOnlineQueue.value;
  }

  function getNextOnlineSongForPrefetch(song: SongInfo): SongInfo | null {
    if (options.getPlayMode() === PlayMode.REPEAT_ONE) return null;

    const playlistId = options.getCurrentPlaylistId();
    if (playlistId) {
      const list = options.getPlaylist(playlistId);
      if (!list || list.items.length <= 1) return null;
      const currentIndex = list.items.findIndex(
        (item) => item.type === "online" && item.song.id === song.id
      );
      if (currentIndex === -1) return null;

      for (let offset = 1; offset < list.items.length; offset++) {
        const item = list.items[(currentIndex + offset) % list.items.length];
        if (item.type === "online" && item.song.id !== song.id) return item.song;
      }
      return null;
    }

    const queue = getActiveOnlineQueue();
    if (queue.length <= 1) return null;
    const currentIndex = queue.findIndex((item) => item.id === song.id);
    if (currentIndex === -1) return null;
    return queue[(currentIndex + 1) % queue.length];
  }

  function rememberPrefetchedOnlineSong(id: string) {
    if (prefetchedOnlineSongIds.has(id)) {
      prefetchedOnlineSongIds.delete(id);
    }
    prefetchedOnlineSongIds.add(id);

    while (prefetchedOnlineSongIds.size > MAX_PREFETCHED_ONLINE_SONG_IDS) {
      const oldestId = prefetchedOnlineSongIds.values().next().value;
      if (!oldestId) break;
      prefetchedOnlineSongIds.delete(oldestId);
    }
  }

  async function prefetchNextOnlineSong(song: SongInfo) {
    const nextSong = getNextOnlineSongForPrefetch(song);
    if (!nextSong) return;
    await prefetchOnlineSong(nextSong.id);
  }

  async function prefetchOnlineSong(id: string) {
    if (
      prefetchedOnlineSongIds.has(id) ||
      prefetchingOnlineSongIds.has(id) ||
      prefetchingOnlineSongIds.size >= MAX_CONCURRENT_ONLINE_PREFETCHES
    ) {
      return;
    }

    prefetchingOnlineSongIds.add(id);
    try {
      await options.prefetchOnlineSong(id);
      rememberPrefetchedOnlineSong(id);
    } catch (error) {
      console.warn("[播放控制] 预取在线歌曲失败:", error);
    } finally {
      prefetchingOnlineSongIds.delete(id);
    }
  }

  return {
    currentOnlineQueue,
    clearOnlineQueue,
    applyOnlinePlaybackContext,
    getActiveOnlineQueue,
    getNextOnlineSongForPrefetch,
    prefetchOnlineSong,
    prefetchNextOnlineSong,
  };
}

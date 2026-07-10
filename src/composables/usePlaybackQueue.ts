import { ref } from "vue";
import { PlayMode, ViewMode, type Playlist, type SongInfo } from "@/types/model";

const MAX_PREFETCHED_ONLINE_SONG_IDS = 300;

export interface PlayOnlineOptions {
  fromPlaylistId?: string;
  queue?: SongInfo[];
}

export function usePlaybackQueue(options: {
  getPlayMode: () => PlayMode;
  getViewMode: () => ViewMode;
  getFallbackOnlineQueue: () => SongInfo[];
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

  function applyOnlinePlaybackContext(playOptions?: PlayOnlineOptions) {
    if (!playOptions?.fromPlaylistId) options.setCurrentPlaylistId(null);
    currentOnlineQueue.value = playOptions?.fromPlaylistId
      ? []
      : [...(playOptions?.queue ?? [])];
  }

  function getActiveOnlineQueue(): SongInfo[] {
    return currentOnlineQueue.value.length > 0
      ? currentOnlineQueue.value
      : options.getFallbackOnlineQueue();
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
    if (options.getViewMode() !== ViewMode.ONLINE || queue.length <= 1) {
      return null;
    }
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
    if (
      prefetchedOnlineSongIds.has(nextSong.id) ||
      prefetchingOnlineSongIds.has(nextSong.id)
    ) {
      return;
    }

    prefetchingOnlineSongIds.add(nextSong.id);
    try {
      await options.prefetchOnlineSong(nextSong.id);
      rememberPrefetchedOnlineSong(nextSong.id);
    } catch (error) {
      console.warn("[播放控制] 预取下一首在线歌曲失败:", error);
    } finally {
      prefetchingOnlineSongIds.delete(nextSong.id);
    }
  }

  return {
    currentOnlineQueue,
    clearOnlineQueue,
    applyOnlinePlaybackContext,
    getActiveOnlineQueue,
    getNextOnlineSongForPrefetch,
    prefetchNextOnlineSong,
  };
}

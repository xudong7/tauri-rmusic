import { ref } from "vue";
import { defineStore } from "pinia";
import { STORAGE_KEY_COLLECTED_PLAYLISTS } from "@/constants";
import type { PlaylistInfo } from "@/types/model";

/** 收藏的在线歌单：只保留列表与侧边栏需要的字段 */
export type CollectedPlaylist = Pick<
  PlaylistInfo,
  "id" | "name" | "cover_url" | "track_count" | "creator" | "play_count"
>;

function toCollectedPlaylist(value: unknown): CollectedPlaylist | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CollectedPlaylist>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    cover_url: typeof raw.cover_url === "string" ? raw.cover_url : "",
    track_count: typeof raw.track_count === "number" ? raw.track_count : 0,
    creator: typeof raw.creator === "string" ? raw.creator : "",
    play_count: typeof raw.play_count === "number" ? raw.play_count : 0,
  };
}

function loadFromStorage(): CollectedPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLLECTED_PLAYLISTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toCollectedPlaylist)
      .filter((item): item is CollectedPlaylist => item !== null);
  } catch {
    return [];
  }
}

function saveToStorage(list: CollectedPlaylist[]) {
  try {
    localStorage.setItem(STORAGE_KEY_COLLECTED_PLAYLISTS, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * 收藏的在线歌单。
 *
 * 与「自建歌单」不同：这里存的是在线歌单的元数据快照，打开时仍走
 * /online/playlist/:id 拉取最新详情，所以持久化到 localStorage 即可，
 * 不必进后端 playlists.json。
 */
export const useCollectedPlaylistStore = defineStore("collectedPlaylist", () => {
  const collectedPlaylists = ref<CollectedPlaylist[]>(loadFromStorage());

  function isCollected(id: string): boolean {
    return collectedPlaylists.value.some((item) => item.id === id);
  }

  /** 收藏/取消收藏，返回操作后的状态（true = 已收藏） */
  function toggleCollected(playlist: CollectedPlaylist): boolean {
    const exists = isCollected(playlist.id);
    if (exists) {
      collectedPlaylists.value = collectedPlaylists.value.filter(
        (item) => item.id !== playlist.id
      );
    } else {
      collectedPlaylists.value = [playlist, ...collectedPlaylists.value];
    }
    saveToStorage(collectedPlaylists.value);
    return !exists;
  }

  /** 详情加载后刷新已收藏条目的元数据（名称/封面等可能已变化） */
  function updateCollected(playlist: CollectedPlaylist) {
    const index = collectedPlaylists.value.findIndex((item) => item.id === playlist.id);
    if (index === -1) return;
    const next = [...collectedPlaylists.value];
    next[index] = playlist;
    collectedPlaylists.value = next;
    saveToStorage(next);
  }

  function removeCollected(id: string) {
    collectedPlaylists.value = collectedPlaylists.value.filter((item) => item.id !== id);
    saveToStorage(collectedPlaylists.value);
  }

  return {
    collectedPlaylists,
    isCollected,
    toggleCollected,
    updateCollected,
    removeCollected,
  };
});

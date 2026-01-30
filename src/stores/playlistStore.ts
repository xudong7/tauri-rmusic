import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { Playlist, PlaylistItem } from "@/types/model";
import { readPlaylists, writePlaylists } from "@/api/commands/playlist";
import { i18n } from "@/i18n";

function generateId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 防抖写入：避免连续多次写入 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;

export const usePlaylistStore = defineStore("playlist", () => {
  const playlists = ref<Playlist[]>([]);

  /** 从 Rust 后端加载播放列表（应用启动时调用） */
  async function loadPlaylists() {
    try {
      const list = await readPlaylists();
      playlists.value = Array.isArray(list) ? list : [];
    } catch (e) {
      console.error("[playlist] load failed:", e);
      ElMessage.error(`${i18n.global.t("errors.unknownError")}: ${e}`);
    }
  }

  /** 写入后端（防抖） */
  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      saveTimeout = null;
      try {
        await writePlaylists(playlists.value);
      } catch (e) {
        console.error("[playlist] save failed:", e);
        ElMessage.error(`${i18n.global.t("errors.unknownError")}: ${e}`);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  watch(playlists, () => scheduleSave(), { deep: true });

  function createPlaylist(name: string): Playlist {
    const list: Playlist = {
      id: generateId(),
      name: name.trim() || "新建播放列表",
      items: [],
      createdAt: Date.now(),
    };
    playlists.value.push(list);
    return list;
  }

  function deletePlaylist(id: string) {
    const idx = playlists.value.findIndex((p) => p.id === id);
    if (idx !== -1) playlists.value.splice(idx, 1);
  }

  function renamePlaylist(id: string, name: string) {
    const list = playlists.value.find((p) => p.id === id);
    if (list) list.name = name.trim() || list.name;
  }

  function getPlaylist(id: string): Playlist | undefined {
    return playlists.value.find((p) => p.id === id);
  }

  /** 判断两个播放列表项是否为同一首歌 */
  function isSamePlaylistItem(a: PlaylistItem, b: PlaylistItem): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "local" && b.type === "local") return a.file_name === b.file_name;
    if (a.type === "online" && b.type === "online") return a.song.id === b.song.id;
    return false;
  }

  /** 添加到播放列表；若已存在相同歌曲则不再添加。返回 true 表示已添加，false 表示已存在。 */
  function addToPlaylist(playlistId: string, item: PlaylistItem): boolean {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (!list) return false;
    const alreadyExists = list.items.some((existing) =>
      isSamePlaylistItem(existing, item)
    );
    if (alreadyExists) return false;
    list.items.push(item);
    return true;
  }

  function removeFromPlaylist(playlistId: string, index: number) {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (list && index >= 0 && index < list.items.length) list.items.splice(index, 1);
  }

  function reorderPlaylist(playlistId: string, fromIndex: number, toIndex: number) {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (!list || fromIndex < 0 || fromIndex >= list.items.length) return;
    const [item] = list.items.splice(fromIndex, 1);
    const safeTo = Math.max(0, Math.min(toIndex, list.items.length));
    list.items.splice(safeTo, 0, item);
  }

  return {
    playlists,
    loadPlaylists,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    getPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
  };
});

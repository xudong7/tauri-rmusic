import { ref } from "vue";
import { defineStore } from "pinia";
import { STORAGE_KEY_COLLECTED_ALBUMS } from "@/constants";
import type { AlbumInfo } from "@/types/model";
import { readJsonFromStorage, writeJsonToStorage } from "@/utils/storage";

/** 收藏的在线专辑：只保留列表与侧边栏需要的字段 */
export type CollectedAlbum = Pick<
  AlbumInfo,
  "id" | "name" | "pic_url" | "size" | "artist" | "publish_time" | "company"
>;

function toCollectedAlbum(value: unknown): CollectedAlbum | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CollectedAlbum>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    pic_url: typeof raw.pic_url === "string" ? raw.pic_url : "",
    size: typeof raw.size === "number" ? raw.size : 0,
    artist: typeof raw.artist === "string" ? raw.artist : "",
    publish_time: typeof raw.publish_time === "number" ? raw.publish_time : 0,
    company: typeof raw.company === "string" ? raw.company : "",
  };
}

function loadFromStorage(): CollectedAlbum[] {
  return readJsonFromStorage<CollectedAlbum[]>(
    STORAGE_KEY_COLLECTED_ALBUMS,
    [],
    (value) => {
      if (!Array.isArray(value)) return [];
      return value
        .map(toCollectedAlbum)
        .filter((item): item is CollectedAlbum => item !== null);
    }
  );
}

function saveToStorage(list: CollectedAlbum[]) {
  writeJsonToStorage(STORAGE_KEY_COLLECTED_ALBUMS, list);
}

/**
 * 收藏的在线专辑。
 *
 * 与 collectedPlaylistStore 同构：存的是元数据快照，打开时仍走
 * /online/album/:id 拉最新详情，所以持久化到 localStorage 即可。
 *
 * 收藏**不会下载专辑里的任何歌曲**——它只是一条指向专辑的引用，想听的时候
 * 在线播放；要离线听哪几首，再单独下载那几首。这与「加入自建歌单」不同：
 * 那条路为了能在曲库里播，会先把整首音频下载下来。
 */
export const useCollectedAlbumStore = defineStore("collectedAlbum", () => {
  const collectedAlbums = ref<CollectedAlbum[]>(loadFromStorage());

  function isCollected(id: string): boolean {
    return collectedAlbums.value.some((item) => item.id === id);
  }

  /** 收藏/取消收藏，返回操作后的状态（true = 已收藏） */
  function toggleCollected(album: CollectedAlbum): boolean {
    const exists = isCollected(album.id);
    if (exists) {
      collectedAlbums.value = collectedAlbums.value.filter(
        (item) => item.id !== album.id
      );
    } else {
      collectedAlbums.value = [album, ...collectedAlbums.value];
    }
    saveToStorage(collectedAlbums.value);
    return !exists;
  }

  /** 详情加载后刷新已收藏条目的元数据（名称/封面等可能已变化） */
  function updateCollected(album: CollectedAlbum) {
    const index = collectedAlbums.value.findIndex((item) => item.id === album.id);
    if (index === -1) return;
    const next = [...collectedAlbums.value];
    next[index] = album;
    collectedAlbums.value = next;
    saveToStorage(next);
  }

  function removeCollected(id: string) {
    collectedAlbums.value = collectedAlbums.value.filter((item) => item.id !== id);
    saveToStorage(collectedAlbums.value);
  }

  return {
    collectedAlbums,
    isCollected,
    toggleCollected,
    updateCollected,
    removeCollected,
  };
});

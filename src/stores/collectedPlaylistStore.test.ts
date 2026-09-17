import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { STORAGE_KEY_COLLECTED_PLAYLISTS } from "@/constants";
import {
  useCollectedPlaylistStore,
  type CollectedPlaylist,
} from "./collectedPlaylistStore";

const playlist: CollectedPlaylist = {
  id: "123",
  name: "Playlist",
  cover_url: "https://example.com/cover.jpg",
  track_count: 10,
  creator: "Creator",
  play_count: 100,
};

describe("collectedPlaylistStore", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("收藏后 isCollected 为真，并写入 localStorage", () => {
    const store = useCollectedPlaylistStore();

    expect(store.isCollected("123")).toBe(false);
    expect(store.toggleCollected(playlist)).toBe(true);
    expect(store.isCollected("123")).toBe(true);
    expect(store.collectedPlaylists).toHaveLength(1);

    const raw = localStorage.getItem(STORAGE_KEY_COLLECTED_PLAYLISTS);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)[0].id).toBe("123");
  });

  it("再次 toggle 取消收藏", () => {
    const store = useCollectedPlaylistStore();

    store.toggleCollected(playlist);
    expect(store.toggleCollected(playlist)).toBe(false);
    expect(store.isCollected("123")).toBe(false);
    expect(store.collectedPlaylists).toHaveLength(0);
  });

  it("新收藏排在最前", () => {
    const store = useCollectedPlaylistStore();

    store.toggleCollected(playlist);
    store.toggleCollected({ ...playlist, id: "456", name: "Second" });

    expect(store.collectedPlaylists.map((item) => item.id)).toEqual(["456", "123"]);
  });

  it("updateCollected 只更新已收藏条目", () => {
    const store = useCollectedPlaylistStore();

    store.toggleCollected(playlist);
    store.updateCollected({ ...playlist, name: "Renamed" });
    expect(store.collectedPlaylists[0].name).toBe("Renamed");

    store.updateCollected({ ...playlist, id: "999", name: "Not collected" });
    expect(store.collectedPlaylists).toHaveLength(1);
  });

  it("从 localStorage 恢复，忽略损坏数据", () => {
    localStorage.setItem(
      STORAGE_KEY_COLLECTED_PLAYLISTS,
      JSON.stringify([playlist, { id: 42 }, null])
    );
    setActivePinia(createPinia());

    const store = useCollectedPlaylistStore();
    expect(store.collectedPlaylists.map((item) => item.id)).toEqual(["123"]);
  });
});

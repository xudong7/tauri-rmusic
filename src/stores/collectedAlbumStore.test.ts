import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { STORAGE_KEY_COLLECTED_ALBUMS } from "@/constants";
import { useCollectedAlbumStore, type CollectedAlbum } from "./collectedAlbumStore";

const album: CollectedAlbum = {
  id: "al1",
  name: "Blood Blockade Battlefront (Original Soundtrack)",
  pic_url: "https://example.com/cover.jpg",
  size: 24,
  artist: "岩崎太整",
  publish_time: 1430000000000,
  company: "Aniplex",
};

describe("collectedAlbumStore", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("收藏后 isCollected 为真，并写入 localStorage", () => {
    const store = useCollectedAlbumStore();

    expect(store.isCollected("al1")).toBe(false);
    expect(store.toggleCollected(album)).toBe(true);
    expect(store.isCollected("al1")).toBe(true);
    expect(store.collectedAlbums).toHaveLength(1);

    const raw = localStorage.getItem(STORAGE_KEY_COLLECTED_ALBUMS);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)[0].id).toBe("al1");
  });

  it("再次 toggle 取消收藏", () => {
    const store = useCollectedAlbumStore();

    store.toggleCollected(album);
    expect(store.toggleCollected(album)).toBe(false);
    expect(store.isCollected("al1")).toBe(false);
    expect(store.collectedAlbums).toHaveLength(0);
  });

  it("新收藏排在最前", () => {
    const store = useCollectedAlbumStore();

    store.toggleCollected(album);
    store.toggleCollected({ ...album, id: "al2", name: "Second" });

    expect(store.collectedAlbums.map((item) => item.id)).toEqual(["al2", "al1"]);
  });

  it("updateCollected 只更新已收藏条目", () => {
    const store = useCollectedAlbumStore();

    store.toggleCollected(album);
    store.updateCollected({ ...album, name: "Renamed" });
    expect(store.collectedAlbums[0].name).toBe("Renamed");

    store.updateCollected({ ...album, id: "nope", name: "Not collected" });
    expect(store.collectedAlbums).toHaveLength(1);
  });

  it("从 localStorage 恢复，忽略损坏数据", () => {
    localStorage.setItem(
      STORAGE_KEY_COLLECTED_ALBUMS,
      JSON.stringify([album, { id: 42 }, null, { name: "没有 id" }])
    );
    setActivePinia(createPinia());

    const store = useCollectedAlbumStore();
    expect(store.collectedAlbums.map((item) => item.id)).toEqual(["al1"]);
  });

  // 收藏专辑的关键语义：它只是一条引用，不碰曲库、不下载任何歌曲。
  // 别的收藏实现（如 useOnlinePlaylistActions 的加入歌单）会先把音频下下来，
  // 这一条把它们区分开——将来有人「顺手」给专辑收藏加上下载时，这条会失败。
  it("收藏不写曲库、不发起任何下载", async () => {
    const musicCommands = await import("@/api/commands/music");
    const downloadSpy = vi
      .spyOn(musicCommands, "downloadMusic")
      .mockResolvedValue("never-called.mp3");
    const store = useCollectedAlbumStore();

    store.toggleCollected(album);

    expect(downloadSpy).not.toHaveBeenCalled();
    expect(store.collectedAlbums).toHaveLength(1);
  });
});

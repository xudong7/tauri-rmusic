import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const api = vi.hoisted(() => ({
  getArtistSongs: vi.fn(),
  getArtistTopSongs: vi.fn(),
  getArtistDetail: vi.fn(),
  getArtistAlbums: vi.fn(),
}));

vi.mock("@/api/commands/netease", () => api);

import { useArtistStore } from "./artistStore";
import type { ArtistInfo, SongInfo } from "@/types/model";

function artist(name: string): ArtistInfo {
  return { id: "6452", name, pic_url: "p" };
}

function songs(ids: string[]): SongInfo[] {
  return ids.map((id) => ({
    id,
    name: `Song ${id}`,
    artists: [],
    album: "",
    duration: 0,
    pic_url: "",
    file_hash: id,
  }));
}

const detail = {
  artist: artist("周杰伦"),
  album_count: 44,
  music_count: 568,
};

describe("artistStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.getArtistDetail.mockResolvedValue(detail);
    api.getArtistAlbums.mockResolvedValue({ albums: [], has_more: false });
  });

  it("loads detail, songs and albums from one entry point", async () => {
    api.getArtistSongs.mockResolvedValue({
      songs: songs(["a"]),
      total: 566,
      has_more: true,
    });

    const store = useArtistStore();
    store.loadArtist("6452");

    await vi.waitFor(() => expect(store.artistSongs).toHaveLength(1));
    expect(api.getArtistDetail).toHaveBeenCalledTimes(1);
    expect(api.getArtistAlbums).toHaveBeenCalledTimes(1);
    expect(store.currentArtist?.name).toBe("周杰伦");
    expect(store.artistAlbumCount).toBe(44);
    expect(store.artistSongsHasMore).toBe(true);
  });

  it("falls back to top songs when the paged endpoint fails on page 1", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getArtistSongs.mockRejectedValue(new Error("no such route"));
    api.getArtistTopSongs.mockResolvedValue({
      artist: artist("周杰伦"),
      songs: songs(["a", "b"]),
      total: 2,
    });

    const store = useArtistStore();
    await store.loadArtistSongs("6452", 1);

    expect(store.artistSongs.map((s) => s.id)).toEqual(["a", "b"]);
    // 热门接口只有固定 50 首，必须停止翻页，否则会无限请求
    expect(store.artistSongsHasMore).toBe(false);
    consoleError.mockRestore();
  });

  it("falls back when the paged endpoint returns an empty first page", async () => {
    api.getArtistSongs.mockResolvedValue({ songs: [], total: 0, has_more: false });
    api.getArtistTopSongs.mockResolvedValue({
      artist: artist("周杰伦"),
      songs: songs(["a"]),
      total: 1,
    });

    const store = useArtistStore();
    await store.loadArtistSongs("6452", 1);

    expect(api.getArtistTopSongs).toHaveBeenCalledTimes(1);
    expect(store.artistSongs).toHaveLength(1);
  });

  it("appends on load more without falling back", async () => {
    api.getArtistSongs
      .mockResolvedValueOnce({ songs: songs(["a"]), total: 2, has_more: true })
      .mockResolvedValueOnce({ songs: songs(["b"]), total: 2, has_more: false });

    const store = useArtistStore();
    await store.loadArtistSongs("6452", 1);
    await store.loadMoreArtistSongs();

    expect(store.artistSongs.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store.artistSongsHasMore).toBe(false);
    // 翻页路径不应触发回退
    expect(api.getArtistTopSongs).not.toHaveBeenCalled();
  });

  it("stops loading more once has_more is false", async () => {
    api.getArtistSongs.mockResolvedValue({
      songs: songs(["a"]),
      total: 1,
      has_more: false,
    });

    const store = useArtistStore();
    await store.loadArtistSongs("6452", 1);
    await store.loadMoreArtistSongs();

    expect(api.getArtistSongs).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous artist name when the backend returns the placeholder", async () => {
    // 详情接口拿不到名字时不应把已渲染的名字覆盖成占位值
    api.getArtistDetail.mockResolvedValue({
      ...detail,
      artist: artist("Artist"),
    });
    api.getArtistSongs.mockResolvedValue({ songs: [], total: 0, has_more: false });
    api.getArtistTopSongs.mockResolvedValue({
      artist: artist("Artist"),
      songs: [],
      total: 0,
    });

    const store = useArtistStore();
    store.currentArtist = { id: "6452", name: "周杰伦", pic_url: "p" };
    await store.loadArtistSongs("6452", 1);

    expect(store.currentArtist?.name).toBe("周杰伦");
  });

  it("does not let an empty album list block the songs list", async () => {
    api.getArtistSongs.mockResolvedValue({
      songs: songs(["a"]),
      total: 1,
      has_more: false,
    });

    const store = useArtistStore();
    store.loadArtist("6452");

    await vi.waitFor(() => expect(store.artistSongs).toHaveLength(1));
    expect(store.artistAlbums).toEqual([]);
    expect(store.isAlbumsLoading).toBe(false);
  });
});

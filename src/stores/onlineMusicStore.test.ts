import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const api = vi.hoisted(() => ({
  searchOnlineMix: vi.fn(),
  searchOnlineArtists: vi.fn(),
  searchOnlineAlbums: vi.fn(),
  searchOnlinePlaylists: vi.fn(),
}));

vi.mock("@/api/commands/netease", () => api);

import { useOnlineMusicStore } from "./onlineMusicStore";
import type { AlbumInfo, ArtistInfo, PlaylistInfo, SongInfo } from "@/types/model";

function song(id: string): SongInfo {
  return {
    id,
    name: `Song ${id}`,
    artists: ["A"],
    album: "Al",
    duration: 1000,
    pic_url: "",
    file_hash: id,
  };
}

function artist(id: string): ArtistInfo {
  return { id, name: `Artist ${id}`, pic_url: "" };
}

function album(id: string): AlbumInfo {
  return {
    id,
    name: `Album ${id}`,
    pic_url: "",
    size: 1,
    artist: "A",
    publish_time: 0,
    company: "",
  };
}

function playlist(id: string): PlaylistInfo {
  return {
    id,
    name: `Playlist ${id}`,
    cover_url: "",
    track_count: 1,
    play_count: 0,
    creator: "C",
    description: "",
    update_frequency: "",
  };
}

/** 一个可手动决定何时 resolve 的 promise，用于构造竞态 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("onlineMusicStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("searches only the active tab", async () => {
    api.searchOnlineMix.mockResolvedValue({ songs: [song("1")], artists: [], total: 1 });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");

    expect(api.searchOnlineMix).toHaveBeenCalledTimes(1);
    // 关键：不应向其他三个端点扇出
    expect(api.searchOnlineArtists).not.toHaveBeenCalled();
    expect(api.searchOnlineAlbums).not.toHaveBeenCalled();
    expect(api.searchOnlinePlaylists).not.toHaveBeenCalled();
    expect(store.onlineSongs).toHaveLength(1);
  });

  it("keeps artist strip populated on the song tab", async () => {
    // PlayerBar / ImmersiveView 依赖 onlineArtists 做歌手名跳转
    api.searchOnlineMix.mockResolvedValue({
      songs: [song("1")],
      artists: [artist("9")],
      total: 1,
    });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");
    expect(store.onlineArtists).toHaveLength(1);
  });

  it("fetches a tab lazily on first switch only", async () => {
    api.searchOnlineMix.mockResolvedValue({ songs: [song("1")], artists: [], total: 1 });
    api.searchOnlineAlbums.mockResolvedValue({ albums: [album("2")], total: 1 });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");

    store.setTab("album");
    await vi.waitFor(() => expect(store.albumResults).toHaveLength(1));
    expect(api.searchOnlineAlbums).toHaveBeenCalledTimes(1);

    // 切回单曲（已加载过该关键词）不应重新请求，再切回专辑也不应重复请求
    store.setTab("song");
    store.setTab("album");
    expect(api.searchOnlineAlbums).toHaveBeenCalledTimes(1);
    expect(api.searchOnlineMix).toHaveBeenCalledTimes(1);
  });

  it("drops a stale response when a newer search started", async () => {
    const first = deferred<{ songs: SongInfo[]; artists: ArtistInfo[]; total: number }>();
    const second = deferred<{
      songs: SongInfo[];
      artists: ArtistInfo[];
      total: number;
    }>();
    api.searchOnlineMix
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const store = useOnlineMusicStore();
    const firstCall = store.searchActiveTab("old");
    const secondCall = store.searchActiveTab("new");

    // 后发的先回，先发的后回——先发的结果必须被丢弃
    second.resolve({ songs: [song("new")], artists: [], total: 1 });
    await secondCall;
    first.resolve({ songs: [song("old")], artists: [], total: 1 });
    await firstCall;

    expect(store.onlineSongs.map((s) => s.id)).toEqual(["new"]);
    expect(store.searchKeyword).toBe("new");
  });

  it("appends instead of replacing when loading a later page", async () => {
    api.searchOnlineMix
      .mockResolvedValueOnce({ songs: [song("1")], artists: [], total: 2 })
      .mockResolvedValueOnce({ songs: [song("2")], artists: [], total: 2 });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");
    expect(store.tabMeta.song.hasMore).toBe(true);

    store.loadMoreActiveTab();
    await vi.waitFor(() => expect(store.onlineSongs).toHaveLength(2));
    expect(store.onlineSongs.map((s) => s.id)).toEqual(["1", "2"]);
    expect(store.tabMeta.song.hasMore).toBe(false);
  });

  it("does not load more once the list is exhausted", async () => {
    api.searchOnlineMix.mockResolvedValue({ songs: [song("1")], artists: [], total: 1 });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");
    store.loadMoreActiveTab();
    expect(api.searchOnlineMix).toHaveBeenCalledTimes(1);
  });

  it("clears every tab on reset", async () => {
    api.searchOnlineMix.mockResolvedValue({
      songs: [song("1")],
      artists: [artist("9")],
      total: 1,
    });
    api.searchOnlineAlbums.mockResolvedValue({ albums: [album("2")], total: 1 });
    api.searchOnlineArtists.mockResolvedValue({ artists: [artist("3")], total: 1 });
    api.searchOnlinePlaylists.mockResolvedValue({ playlists: [playlist("4")], total: 1 });

    const store = useOnlineMusicStore();
    await store.searchActiveTab("jay");
    store.setTab("album");
    await vi.waitFor(() => expect(store.albumResults).toHaveLength(1));
    store.setTab("artist");
    await vi.waitFor(() => expect(store.artistResults).toHaveLength(1));
    store.setTab("playlist");
    await vi.waitFor(() => expect(store.playlistResults).toHaveLength(1));

    store.resetResults();

    expect(store.onlineSongs).toEqual([]);
    expect(store.onlineArtists).toEqual([]);
    expect(store.albumResults).toEqual([]);
    expect(store.artistResults).toEqual([]);
    expect(store.playlistResults).toEqual([]);
    expect(store.searchKeyword).toBe("");
    expect(store.tabMeta.song.loadedKeyword).toBe("");
    expect(store.tabMeta.playlist.loadedKeyword).toBe("");
  });

  it("surfaces a failure without leaving the tab stuck loading", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.searchOnlineAlbums.mockRejectedValue(new Error("boom"));

    const store = useOnlineMusicStore();
    store.setTab("album");
    await store.searchActiveTab("jay");

    expect(store.tabMeta.album.loading).toBe(false);
    consoleError.mockRestore();
  });
});

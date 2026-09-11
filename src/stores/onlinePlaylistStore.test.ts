import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const api = vi.hoisted(() => ({
  getPlaylistDetail: vi.fn(),
  getPlaylistTracks: vi.fn(),
  getToplist: vi.fn(),
}));

vi.mock("@/api/commands/netease", () => api);

import { useOnlinePlaylistStore } from "./onlinePlaylistStore";
import type { PlaylistInfo, SongInfo } from "@/types/model";

function playlist(id: string, trackCount = 200): PlaylistInfo {
  return {
    id,
    name: `Playlist ${id}`,
    cover_url: "",
    track_count: trackCount,
    play_count: 1,
    creator: "C",
    description: "",
    update_frequency: "",
  };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("onlinePlaylistStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads metadata then the first page of tracks", async () => {
    api.getPlaylistDetail.mockResolvedValue({ playlist: playlist("1", 200) });
    api.getPlaylistTracks.mockResolvedValue({ songs: songs(["a"]), has_more: false });

    const store = useOnlinePlaylistStore();
    await store.loadDetail("1");

    expect(store.detail?.id).toBe("1");
    expect(store.songs).toHaveLength(1);
    // 首屏按每页上限一次取满，避免播放队列只有第一页
    expect(api.getPlaylistTracks).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1", offset: 0, trackCount: 200 })
    );
  });

  it("appends on load more and follows has_more", async () => {
    api.getPlaylistDetail.mockResolvedValue({ playlist: playlist("1", 3) });
    api.getPlaylistTracks
      .mockResolvedValueOnce({ songs: songs(["a", "b"]), has_more: true })
      .mockResolvedValueOnce({ songs: songs(["c"]), has_more: false });

    const store = useOnlinePlaylistStore();
    await store.loadDetail("1");
    expect(store.hasMoreTracks).toBe(true);

    await store.loadMoreTracks();
    expect(store.songs.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(store.hasMoreTracks).toBe(false);

    // 已到底，再调不应发请求
    await store.loadMoreTracks();
    expect(api.getPlaylistTracks).toHaveBeenCalledTimes(2);
  });

  it("requests the next page from the current offset", async () => {
    api.getPlaylistDetail.mockResolvedValue({ playlist: playlist("1", 400) });
    api.getPlaylistTracks
      .mockResolvedValueOnce({ songs: songs(["a", "b"]), has_more: true })
      .mockResolvedValueOnce({ songs: songs(["c"]), has_more: true });

    const store = useOnlinePlaylistStore();
    await store.loadDetail("1");
    await store.loadMoreTracks();

    expect(api.getPlaylistTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 2 })
    );
  });

  it("discards a stale detail when switching playlists mid-flight", async () => {
    const first = deferred<{ playlist: PlaylistInfo }>();
    const second = deferred<{ playlist: PlaylistInfo }>();
    api.getPlaylistDetail
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    api.getPlaylistTracks.mockResolvedValue({ songs: [], has_more: false });

    const store = useOnlinePlaylistStore();
    const firstLoad = store.loadDetail("old");
    const secondLoad = store.loadDetail("new");

    second.resolve({ playlist: playlist("new") });
    await secondLoad;
    first.resolve({ playlist: playlist("old") });
    await firstLoad;

    expect(store.detail?.id).toBe("new");
  });

  it("clears the previous playlist while the next one loads", async () => {
    api.getPlaylistDetail.mockResolvedValue({ playlist: playlist("1") });
    api.getPlaylistTracks.mockResolvedValue({ songs: songs(["a"]), has_more: false });

    const store = useOnlinePlaylistStore();
    await store.loadDetail("1");
    expect(store.songs).toHaveLength(1);

    const pending = deferred<{ playlist: PlaylistInfo }>();
    api.getPlaylistDetail.mockReturnValueOnce(pending.promise);
    const loading = store.loadDetail("2");

    // 切换瞬间不应残留上一个歌单的曲目
    expect(store.songs).toEqual([]);
    pending.resolve({ playlist: playlist("2") });
    await loading;
  });

  it("loads toplists", async () => {
    api.getToplist.mockResolvedValue({ toplists: [playlist("19723756", 100)] });

    const store = useOnlinePlaylistStore();
    await store.loadToplist();

    expect(store.toplists).toHaveLength(1);
    expect(store.toplists[0].id).toBe("19723756");
  });

  it("reports a failure without leaving loading stuck", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getPlaylistDetail.mockRejectedValue(new Error("boom"));

    const store = useOnlinePlaylistStore();
    await store.loadDetail("1");

    expect(store.isDetailLoading).toBe(false);
    expect(store.detail).toBeNull();
    consoleError.mockRestore();
  });
});

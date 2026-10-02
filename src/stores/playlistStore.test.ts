import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaylistStore } from "./playlistStore";

const playlistApi = vi.hoisted(() => ({
  readPlaylists: vi.fn(),
  writePlaylists: vi.fn(),
}));

vi.mock("@/api/commands/playlist", () => playlistApi);

describe("playlistStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    playlistApi.readPlaylists.mockReset().mockResolvedValue([]);
    playlistApi.writePlaylists.mockReset().mockResolvedValue(undefined);
  });

  it("deduplicates local tracks and reorders entries", async () => {
    const store = usePlaylistStore();
    await store.loadPlaylists();
    const playlist = store.createPlaylist("Work");

    expect(store.addToPlaylist(playlist.id, { type: "local", file_name: "A.mp3" })).toBe(
      true
    );
    expect(store.addToPlaylist(playlist.id, { type: "local", file_name: "A.mp3" })).toBe(
      false
    );
    store.addToPlaylist(playlist.id, { type: "local", file_name: "B.mp3" });
    store.reorderPlaylist(playlist.id, 1, 0);

    expect(store.getPlaylist(playlist.id)?.items).toEqual([
      { type: "local", file_name: "B.mp3" },
      { type: "local", file_name: "A.mp3" },
    ]);
    await store.flushSave();
  });

  it("insertIntoPlaylist inserts at the index and moves existing items", async () => {
    const store = usePlaylistStore();
    await store.loadPlaylists();
    const playlist = store.createPlaylist("Work");
    const a = { type: "local" as const, file_name: "A.mp3" };
    const b = { type: "local" as const, file_name: "B.mp3" };
    const c = { type: "local" as const, file_name: "C.mp3" };
    store.addToPlaylist(playlist.id, a);
    store.addToPlaylist(playlist.id, b);
    store.addToPlaylist(playlist.id, c);

    // 插到 A 之后（「下一首播放 B」）
    store.insertIntoPlaylist(playlist.id, 1, b);
    expect(store.getPlaylist(playlist.id)?.items).toEqual([a, b, c]);

    // C 已在队尾：移动到 A 之后，不能留下两份
    store.insertIntoPlaylist(playlist.id, 1, c);
    expect(store.getPlaylist(playlist.id)?.items).toEqual([a, c, b]);
    await store.flushSave();
  });

  it("insertIntoPlaylist clamps the index and reports unknown playlists", async () => {
    const store = usePlaylistStore();
    await store.loadPlaylists();
    const playlist = store.createPlaylist("Work");
    const a = { type: "local" as const, file_name: "A.mp3" };

    store.insertIntoPlaylist(playlist.id, 99, a);
    expect(store.getPlaylist(playlist.id)?.items).toEqual([a]);
    expect(store.insertIntoPlaylist("missing", 0, a)).toBe(false);
    await store.flushSave();
  });
});

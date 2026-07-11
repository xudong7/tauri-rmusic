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
});

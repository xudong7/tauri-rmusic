import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicFile, SongInfo } from "@/types/model";

const mocks = vi.hoisted(() => ({
  playTrack: vi.fn(),
  playNeteaseSong: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@/api/commands/music", () => ({
  playTrack: (...args: unknown[]) => mocks.playTrack(...args),
  preparePlaybackRequest: vi.fn().mockResolvedValue(undefined),
  getPlaybackState: vi.fn().mockResolvedValue({
    position_ms: 0,
    duration_ms: 0,
    is_paused: false,
    has_track: false,
    track_id: 0,
  }),
  handleEvent: vi.fn().mockResolvedValue(undefined),
  playNeteaseSong: (...args: unknown[]) => mocks.playNeteaseSong(...args),
  prefetchNeteaseSong: vi.fn().mockResolvedValue(undefined),
  seekTo: vi.fn(),
  getOnlineAudioCacheSize: vi.fn(),
  getOnlineAudioCachePath: vi.fn(),
  clearOnlineAudioCache: vi.fn(),
  downloadMusic: vi.fn(),
}));

vi.mock("@/api/commands/netease", () => ({
  checkOnlineServiceStatus: vi.fn().mockResolvedValue({
    available: true,
    message: "",
    status_code: 200,
  }),
  ensureOnlineService: vi.fn().mockResolvedValue(undefined),
  restartOnlineService: vi.fn(),
}));

vi.mock("@/api/commands/playlist", () => ({
  readPlaylists: vi.fn().mockResolvedValue([]),
  writePlaylists: vi.fn().mockResolvedValue(undefined),
}));

import { usePlayerStore } from "./playerStore";
import { useLocalMusicStore } from "./localMusicStore";
import { usePlaylistStore } from "./playlistStore";

function file(name: string, id = 1): MusicFile {
  return {
    id,
    file_name: name,
    key: `k${name}`,
    relative_path: name,
    extension: "mp3",
    modified_ms: id,
    search_text: name,
  };
}

function song(id: string): SongInfo {
  return {
    id,
    name: `Song ${id}`,
    artists: ["Artist"],
    album: "Album",
    duration: 1000,
    pic_url: "",
    file_hash: `h${id}`,
  };
}

function playResult(trackId: number) {
  return {
    position_ms: 0,
    duration_ms: 100000,
    is_paused: false,
    has_track: true,
    track_id: trackId,
  };
}

describe("队列管理", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.playTrack.mockReset().mockResolvedValue(playResult(1));
    mocks.playNeteaseSong.mockReset().mockResolvedValue({
      url: "http://localhost/1.mp3",
      pic_url: "",
    });
    setActivePinia(createPinia());
  });

  it("本地队列：移除指定项、清空保留当前、另存为歌单", async () => {
    const playerStore = usePlayerStore();
    const localStore = useLocalMusicStore();
    const playlistStore = usePlaylistStore();
    const a = file("a.mp3", 1);
    const b = file("b.mp3", 2);
    const c = file("c.mp3", 3);
    localStore.musicFiles = [a, b, c];
    localStore.currentDirectory = "/lib/music";
    await playlistStore.loadPlaylists();

    await playerStore.playMusic(a, { queue: [a, b, c] });

    playerStore.removeQueueItem(1);
    expect(playerStore.currentLocalQueue.map((item) => item.file_name)).toEqual([
      "a.mp3",
      "c.mp3",
    ]);

    // 当前曲目不可移除
    playerStore.removeQueueItem(0);
    expect(playerStore.currentLocalQueue).toHaveLength(2);

    playerStore.clearQueue();
    expect(playerStore.currentLocalQueue.map((item) => item.file_name)).toEqual([
      "a.mp3",
    ]);

    const playlistId = playerStore.saveQueueAsPlaylist("Snapshot");
    expect(playlistId).not.toBeNull();
    expect(playlistStore.getPlaylist(playlistId!)?.items).toEqual([
      { type: "local", file_name: "a.mp3" },
    ]);
    await playlistStore.flushSave();
    playerStore.stopPlayTimeTracking();
  });

  it("在线队列：移除指定项", async () => {
    const playerStore = usePlayerStore();
    const a = song("1");
    const b = song("2");
    await playerStore.playOnlineSong(a, { queue: [a, b] });

    playerStore.removeQueueItem(1);
    expect(playerStore.currentOnlineQueue.map((item) => item.id)).toEqual(["1"]);
  });

  it("歌单上下文：移除与清空都会落到歌单本身", async () => {
    const playerStore = usePlayerStore();
    const localStore = useLocalMusicStore();
    const playlistStore = usePlaylistStore();
    const a = file("a.mp3", 1);
    const b = file("b.mp3", 2);
    localStore.musicFiles = [a, b];
    localStore.currentDirectory = "/lib/music";
    await playlistStore.loadPlaylists();
    const playlist = playlistStore.createPlaylist("Work");
    playlistStore.addToPlaylist(playlist.id, { type: "local", file_name: "a.mp3" });
    playlistStore.addToPlaylist(playlist.id, { type: "local", file_name: "b.mp3" });
    await playerStore.playFromPlaylist(playlist.id, 0);

    playerStore.removeQueueItem(1);
    expect(playlistStore.getPlaylist(playlist.id)?.items).toEqual([
      { type: "local", file_name: "a.mp3" },
    ]);

    playerStore.clearQueue();
    expect(playlistStore.getPlaylist(playlist.id)?.items).toEqual([
      { type: "local", file_name: "a.mp3" },
    ]);
    await playlistStore.flushSave();
    playerStore.stopPlayTimeTracking();
  });
});

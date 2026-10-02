import { createPinia, setActivePinia } from "pinia";
import { ElMessage } from "element-plus";
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

describe("playNextInQueue", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.playTrack.mockReset().mockResolvedValue(playResult(1));
    mocks.playNeteaseSong.mockReset().mockResolvedValue({
      url: "http://localhost/1.mp3",
      pic_url: "",
    });
    vi.spyOn(ElMessage, "success").mockImplementation(() => ({}) as never);
    setActivePinia(createPinia());
  });

  it("本地队列：插到当前曲目之后", async () => {
    const playerStore = usePlayerStore();
    const localStore = useLocalMusicStore();
    const a = file("a.mp3", 1);
    const b = file("b.mp3", 2);
    const c = file("c.mp3", 3);
    localStore.musicFiles = [a, b, c];
    localStore.currentDirectory = "/lib/music";
    await playerStore.playMusic(a, { queue: [a, b] });

    await playerStore.playNextInQueue({ type: "local", file: c });
    expect(playerStore.currentLocalQueue.map((item) => item.file_name)).toEqual([
      "a.mp3",
      "c.mp3",
      "b.mp3",
    ]);

    // 已在队列里的 B：挪到当前曲目之后，不重复
    await playerStore.playNextInQueue({ type: "local", file: b });
    expect(playerStore.currentLocalQueue.map((item) => item.file_name)).toEqual([
      "a.mp3",
      "b.mp3",
      "c.mp3",
    ]);
    playerStore.stopPlayTimeTracking();
  });

  it("在线队列：插到当前曲目之后", async () => {
    const playerStore = usePlayerStore();
    const a = song("1");
    const b = song("2");
    const c = song("3");
    await playerStore.playOnlineSong(a, { queue: [a, b] });

    await playerStore.playNextInQueue({ type: "online", song: c });
    expect(playerStore.currentOnlineQueue.map((item) => item.id)).toEqual([
      "1",
      "3",
      "2",
    ]);
  });

  it("歌单上下文：插进歌单本身（持久化的播放顺序）", async () => {
    const playerStore = usePlayerStore();
    const localStore = useLocalMusicStore();
    const playlistStore = usePlaylistStore();
    const a = file("a.mp3", 1);
    const b = file("b.mp3", 2);
    const c = file("c.mp3", 3);
    localStore.musicFiles = [a, b, c];
    localStore.currentDirectory = "/lib/music";
    await playlistStore.loadPlaylists();
    const playlist = playlistStore.createPlaylist("Work");
    playlistStore.addToPlaylist(playlist.id, { type: "local", file_name: "a.mp3" });
    playlistStore.addToPlaylist(playlist.id, { type: "local", file_name: "b.mp3" });
    await playerStore.playFromPlaylist(playlist.id, 0);

    await playerStore.playNextInQueue({ type: "local", file: c });

    expect(playlistStore.getPlaylist(playlist.id)?.items).toEqual([
      { type: "local", file_name: "a.mp3" },
      { type: "local", file_name: "c.mp3" },
      { type: "local", file_name: "b.mp3" },
    ]);
    await playlistStore.flushSave();
    playerStore.stopPlayTimeTracking();
  });

  it("没有正在播放的曲目时直接播放目标", async () => {
    const playerStore = usePlayerStore();
    const localStore = useLocalMusicStore();
    const a = file("a.mp3", 1);
    localStore.musicFiles = [a];
    localStore.currentDirectory = "/lib/music";

    await playerStore.playNextInQueue({ type: "local", file: a });

    expect(playerStore.currentMusic?.file_name).toBe("a.mp3");
    expect(playerStore.isPlaying).toBe(true);
    playerStore.stopPlayTimeTracking();
  });
});

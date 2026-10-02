import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicFile, SongInfo } from "@/types/model";
import { PLAYER_SESSION_VERSION, STORAGE_KEY_PLAYER_SESSION } from "@/constants";

const mocks = vi.hoisted(() => ({
  playTrack: vi.fn(),
  seekTo: vi.fn(),
  ensureOnlineService: vi.fn(),
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
  playNeteaseSong: vi
    .fn()
    .mockResolvedValue({ url: "http://localhost/1.mp3", pic_url: "" }),
  prefetchNeteaseSong: vi.fn().mockResolvedValue(undefined),
  seekTo: (...args: unknown[]) => mocks.seekTo(...args),
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
  ensureOnlineService: (...args: unknown[]) => mocks.ensureOnlineService(...args),
  restartOnlineService: vi.fn(),
}));

import { usePlayerStore } from "./playerStore";
import { useLocalMusicStore } from "./localMusicStore";
import type { PlayerSessionSnapshot } from "./player/sessionPersistence";

const fileA: MusicFile = {
  id: 1,
  file_name: "a.mp3",
  key: "ka",
  relative_path: "a.mp3",
  extension: "mp3",
  modified_ms: 1,
  search_text: "a",
};

const fileB: MusicFile = {
  id: 2,
  file_name: "b.mp3",
  key: "kb",
  relative_path: "b.mp3",
  extension: "mp3",
  modified_ms: 2,
  search_text: "b",
};

const songA: SongInfo = {
  id: "11",
  name: "Song A",
  artists: ["Artist A"],
  album: "Album",
  duration: 180000,
  pic_url: "http://localhost/a.jpg",
  file_hash: "ha",
};

const songB: SongInfo = {
  id: "22",
  name: "Song B",
  artists: ["Artist B"],
  album: "Album",
  duration: 200000,
  pic_url: "http://localhost/b.jpg",
  file_hash: "hb",
};

function writeSession(overrides: Partial<PlayerSessionSnapshot> = {}) {
  localStorage.setItem(
    STORAGE_KEY_PLAYER_SESSION,
    JSON.stringify({
      version: PLAYER_SESSION_VERSION,
      positionMs: 0,
      playlistId: null,
      localKey: null,
      onlineSong: null,
      localQueueKeys: [],
      onlineQueue: [],
      ...overrides,
    })
  );
}

function readSession(): PlayerSessionSnapshot {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_PLAYER_SESSION) ?? "null");
}

function playResult(trackId: number, durationMs: number) {
  return {
    position_ms: 0,
    duration_ms: durationMs,
    is_paused: false,
    has_track: true,
    track_id: trackId,
  };
}

describe("播放会话恢复", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.playTrack.mockReset().mockResolvedValue(playResult(1, 100000));
    mocks.seekTo
      .mockReset()
      .mockResolvedValue({ success: true, should_play_next: false });
    mocks.ensureOnlineService.mockReset().mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  it("恢复本地曲目、队列与进度，但不自动播放", () => {
    const store = usePlayerStore();
    const localStore = useLocalMusicStore();
    localStore.musicFiles = [fileA, fileB];
    localStore.currentDirectory = "/lib/music";
    writeSession({
      localKey: "a.mp3",
      localQueueKeys: ["a.mp3", "b.mp3"],
      positionMs: 42000,
    });

    expect(store.restoreSession()).toBe(true);
    expect(store.currentMusic?.file_name).toBe("a.mp3");
    expect(store.currentLocalQueue.map((file) => file.file_name)).toEqual([
      "a.mp3",
      "b.mp3",
    ]);
    expect(store.currentPlayTime).toBe(42000);
    expect(store.isPlaying).toBe(false);
    expect(store.sessionResumePending).toBe(true);
  });

  it("文件已不在曲库时放弃恢复并清掉会话", () => {
    const store = usePlayerStore();
    useLocalMusicStore().musicFiles = [fileB];
    writeSession({ localKey: "gone.mp3", positionMs: 1000 });

    expect(store.restoreSession()).toBe(false);
    expect(store.hasCurrentTrack).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_PLAYER_SESSION)).toBeNull();
  });

  it("恢复出来的曲目在按播放前拖动进度只更新显示，不请求后端", async () => {
    const store = usePlayerStore();
    useLocalMusicStore().musicFiles = [fileA];
    writeSession({ localKey: "a.mp3", positionMs: 42000 });
    store.restoreSession();

    await store.seekToPosition(90000);

    expect(store.currentPlayTime).toBe(90000);
    expect(mocks.seekTo).not.toHaveBeenCalled();
  });

  it("按播放时先重新加载，再跳回保存的位置", async () => {
    const store = usePlayerStore();
    const localStore = useLocalMusicStore();
    localStore.musicFiles = [fileA];
    localStore.currentDirectory = "/lib/music";
    writeSession({ localKey: "a.mp3", localQueueKeys: ["a.mp3"], positionMs: 42000 });
    store.restoreSession();

    await store.togglePlay();

    expect(mocks.playTrack).toHaveBeenCalledWith(
      { type: "local", path: "/lib/music/a.mp3" },
      expect.any(Number)
    );
    expect(store.currentPlayTime).toBe(42000);
    expect(store.sessionResumePending).toBe(false);
    expect(store.isPlaying).toBe(true);
    store.stopPlayTimeTracking();
  });

  it("恢复在线曲目与队列，时长取在线元数据", () => {
    const store = usePlayerStore();
    writeSession({
      onlineSong: songA,
      onlineQueue: [songA, songB],
      positionMs: 1500,
    });

    expect(store.restoreSession()).toBe(true);
    expect(store.currentOnlineSong?.id).toBe(songA.id);
    expect(store.currentOnlineQueue.map((song) => song.id)).toEqual([songA.id, songB.id]);
    expect(store.currentTrackDuration).toBe(songA.duration);
    expect(store.sessionResumePending).toBe(true);
  });

  it("播放/切换曲目后立即把会话写盘", async () => {
    const store = usePlayerStore();
    const localStore = useLocalMusicStore();
    localStore.musicFiles = [fileA, fileB];
    localStore.currentDirectory = "/lib/music";

    await store.playMusic(fileA, { queue: [fileA, fileB] });

    const saved = readSession();
    expect(saved.version).toBe(PLAYER_SESSION_VERSION);
    expect(saved.localKey).toBe("a.mp3");
    expect(saved.localQueueKeys).toEqual(["a.mp3", "b.mp3"]);
    expect(saved.onlineSong).toBeNull();
    store.stopPlayTimeTracking();
  });
});

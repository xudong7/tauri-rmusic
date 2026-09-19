import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicFile } from "@/types/model";

type EndedPayload = { position_ms: number; duration_ms: number; track_id: number };
const endedListeners: Array<(event: { payload: EndedPayload }) => void> = [];

const playTrackMock = vi.fn();
const getPlaybackStateMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: (e: { payload: EndedPayload }) => void) => {
    if (event === "playback-ended") endedListeners.push(cb);
    return () => {};
  }),
}));

vi.mock("@/api/commands/music", () => ({
  playTrack: (...args: unknown[]) => playTrackMock(...args),
  preparePlaybackRequest: vi.fn().mockResolvedValue(undefined),
  getPlaybackState: (...args: unknown[]) => getPlaybackStateMock(...args),
  handleEvent: vi.fn().mockResolvedValue(undefined),
  playNeteaseSong: vi
    .fn()
    .mockResolvedValue({ url: "http://localhost/x.mp3", pic_url: "" }),
  prefetchNeteaseSong: vi.fn().mockResolvedValue(undefined),
  seekTo: vi.fn(),
  getOnlineAudioCacheSize: vi.fn(),
  getOnlineAudioCachePath: vi.fn(),
  clearOnlineAudioCache: vi.fn(),
  downloadMusic: vi.fn(),
}));

import { usePlayerStore } from "./playerStore";

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

function playResult(trackId: number, durationMs: number) {
  return {
    position_ms: 0,
    duration_ms: durationMs,
    is_paused: false,
    has_track: true,
    track_id: trackId,
  };
}

function backendState(
  overrides: Partial<ReturnType<typeof playResult>> & { is_ended?: boolean } = {}
) {
  return {
    position_ms: 0,
    duration_ms: 0,
    is_ended: false,
    is_paused: false,
    has_track: true,
    track_id: 1,
    ...overrides,
  };
}

describe("播放进度与时长", () => {
  beforeEach(() => {
    endedListeners.length = 0;
    playTrackMock.mockReset();
    getPlaybackStateMock.mockReset().mockResolvedValue(backendState());
    setActivePinia(createPinia());
  });

  it("自动切歌后，下一首的时长替换上一首的时长", async () => {
    const store = usePlayerStore();
    await store.startPlaybackEventListening();

    playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
    await store.playMusic(fileA, { queue: [fileA, fileB] });
    expect(store.currentTrackDuration).toBe(100000);

    // 歌曲播完：后端事件带上旧曲的时长
    playTrackMock.mockResolvedValueOnce(playResult(2, 200000));
    endedListeners.forEach((cb) =>
      cb({ payload: { position_ms: 100000, duration_ms: 100000, track_id: 1 } })
    );

    await vi.waitFor(() => {
      expect(store.isLoadingSong).toBe(false);
      expect(store.isPlaying).toBe(true);
    });
    expect(store.currentTrackDuration).toBe(200000);
    store.stopPlayTimeTracking();
  });

  it("后端时长未知（0）时清掉旧时长，而不是留着上一首的", async () => {
    const store = usePlayerStore();
    await store.startPlaybackEventListening();

    playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
    await store.playMusic(fileA, { queue: [fileA, fileB] });
    expect(store.currentTrackDuration).toBe(100000);

    // 后端暂时报不出时长（如边下边播的流）：不能沿用上一首的 100000
    getPlaybackStateMock.mockResolvedValue(
      backendState({ position_ms: 0, duration_ms: 0, track_id: 1 })
    );
    await store.syncProgressFromBackend();

    expect(store.currentTrackDuration).toBe(0);
    store.stopPlayTimeTracking();
  });

  it("切歌加载中忽略后端返回的旧状态", async () => {
    const store = usePlayerStore();
    await store.startPlaybackEventListening();

    playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
    await store.playMusic(fileA, { queue: [fileA, fileB] });
    expect(store.currentTrackDuration).toBe(100000);

    // 切歌：playTrack 挂起，此时 isLoadingSong = true
    let resolvePlay: ((value: unknown) => void) | undefined;
    playTrackMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePlay = resolve;
      })
    );
    const playing = store.playMusic(fileB, { queue: [fileA, fileB] });
    await flushPromises();

    // 在途的旧进度同步（上一首的位置与时长）不得写回
    getPlaybackStateMock.mockResolvedValue(
      backendState({ position_ms: 100000, duration_ms: 100000, track_id: 1 })
    );
    store.startPlayTimeTracking();
    await flushPromises();
    expect(store.currentTrackDuration).toBe(0);
    expect(store.currentPlayTime).toBe(0);

    resolvePlay?.(playResult(2, 200000));
    await playing;
    expect(store.currentTrackDuration).toBe(200000);
    store.stopPlayTimeTracking();
  });
});

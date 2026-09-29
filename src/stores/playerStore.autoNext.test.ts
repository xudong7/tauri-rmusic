import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { ElMessage } from "element-plus";
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
import { useLocalMusicStore } from "./localMusicStore";

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

  // 队列是「开始播放那一刻」的快照。删歌之后快照就过期了：不摘掉的话，
  // 「下一首」会撞上那个不存在的文件、失败、再跳过——用户只是按了一下下一首，
  // 却收到两条弹窗。
  describe("曲库变动后，队列要跟着更新", () => {
    beforeEach(() => {
      endedListeners.length = 0;
      playTrackMock.mockReset();
      getPlaybackStateMock.mockReset().mockResolvedValue(backendState());
      setActivePinia(createPinia());
    });

    it("已删除的文件从本地队列里摘掉", async () => {
      const store = usePlayerStore();
      const localStore = useLocalMusicStore();

      playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
      localStore.musicFiles = [fileA, fileB];
      await store.playMusic(fileA, { queue: [fileA, fileB] });
      expect(store.currentLocalQueue).toHaveLength(2);

      // 删掉 a.mp3 之后曲库重扫的结果
      localStore.musicFiles = [fileB];
      await nextTick();

      expect(store.currentLocalQueue.map((f) => f.file_name)).toEqual(["b.mp3"]);
      store.stopPlayTimeTracking();
    });

    it("仍在曲库里的文件不受影响", async () => {
      const store = usePlayerStore();
      const localStore = useLocalMusicStore();

      playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
      localStore.musicFiles = [fileA, fileB];
      await store.playMusic(fileA, { queue: [fileA, fileB] });

      // 重扫结果一样（只是换了新数组）
      localStore.musicFiles = [{ ...fileA }, { ...fileB }];
      await nextTick();

      expect(store.currentLocalQueue).toHaveLength(2);
      store.stopPlayTimeTracking();
    });

    // 跳过链每首失败都会失败，逐首弹一遍「播放失败」之后还会再弹一句
    // 「已跳过 N 首」——同一件事说两遍，而用户只是按了一下下一首。
    it("跳过链里的失败不弹错误提示，由「已跳过」统一交代", async () => {
      const errorSpy = vi
        .spyOn(ElMessage, "error")
        .mockImplementation(() => ({}) as never);
      const warningSpy = vi
        .spyOn(ElMessage, "warning")
        .mockImplementation(() => ({}) as never);

      const store = usePlayerStore();
      const localStore = useLocalMusicStore();
      localStore.musicFiles = [fileA, fileB];

      playTrackMock.mockResolvedValueOnce(playResult(1, 100000));
      await store.playMusic(fileA, { queue: [fileA, fileB] });

      // b.mp3 放不出来 → 跳过 → 绕回 a.mp3
      playTrackMock
        .mockRejectedValueOnce(new Error("File system error"))
        .mockResolvedValueOnce(playResult(2, 100000));
      await store.playNextOrPreviousMusic(1);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warningSpy).toHaveBeenCalled();
      store.stopPlayTimeTracking();
    });
  });
});

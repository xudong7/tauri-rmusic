import { defineComponent, ref } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongInfo } from "@/types/model";

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  listeners: {} as Record<string, (event: { payload: unknown }) => void>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => mocks.emit(...args),
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    mocks.listeners[name] = cb;
    return () => {};
  }),
}));

vi.mock("@/api/commands/music", () => ({
  playTrack: vi.fn(),
  preparePlaybackRequest: vi.fn().mockResolvedValue(undefined),
  getPlaybackState: vi.fn().mockResolvedValue({
    position_ms: 0,
    duration_ms: 0,
    is_paused: false,
    has_track: false,
    track_id: 0,
  }),
  handleEvent: vi.fn().mockResolvedValue(undefined),
  playNeteaseSong: vi.fn(),
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

import { usePlayerStore } from "@/stores/playerStore";
import {
  LYRICS_OVERLAY_READY_EVENT,
  useLyricsOverlayBridge,
} from "./useLyricsOverlayBridge";

const song: SongInfo = {
  id: "42",
  name: "Song",
  artists: ["Artist"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "h1",
};

function trackPayloads() {
  return mocks.emit.mock.calls
    .filter(([name]) => name === "lyrics-overlay-track")
    .map(([, payload]) => payload);
}

describe("useLyricsOverlayBridge", () => {
  beforeEach(() => {
    mocks.emit.mockReset().mockResolvedValue(undefined);
    mocks.listeners = {};
    localStorage.clear();
  });

  it("曲目变化时把身份与偏移推给悬浮窗", async () => {
    const active = ref(true);
    const Harness = defineComponent({
      setup() {
        useLyricsOverlayBridge(active);
        return () => null;
      },
    });
    const pinia = createPinia();
    mount(Harness, { global: { plugins: [pinia] } });
    const playerStore = usePlayerStore();

    playerStore.currentOnlineSong = song;
    await flushPromises();

    const payloads = trackPayloads();
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[payloads.length - 1]).toEqual({
      source: { type: "online", id: "42" },
      offsetMs: 0,
    });
  });

  it("悬浮窗请求时补发一次，未打开时不推送", async () => {
    const active = ref(false);
    const Harness = defineComponent({
      setup() {
        useLyricsOverlayBridge(active);
        return () => null;
      },
    });
    const pinia = createPinia();
    mount(Harness, { global: { plugins: [pinia] } });
    const playerStore = usePlayerStore();

    playerStore.currentOnlineSong = song;
    await flushPromises();
    expect(trackPayloads()).toHaveLength(0);

    // 悬浮窗就绪：主窗补发当前曲目
    mocks.listeners[LYRICS_OVERLAY_READY_EVENT]?.({ payload: undefined });
    expect(trackPayloads()).toHaveLength(0);

    active.value = true;
    mocks.listeners[LYRICS_OVERLAY_READY_EVENT]?.({ payload: undefined });
    expect(trackPayloads()).toHaveLength(1);
  });
});

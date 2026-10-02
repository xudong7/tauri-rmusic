import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { SongInfo } from "@/types/model";

const mocks = vi.hoisted(() => ({
  updateTrayMenu: vi.fn(),
  updateTrayPlaybackState: vi.fn(),
}));

vi.mock("@/api/commands/system", () => ({
  updateTrayMenu: (...args: unknown[]) => mocks.updateTrayMenu(...args),
  updateTrayPlaybackState: (...args: unknown[]) => mocks.updateTrayPlaybackState(...args),
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
import { useTrayMenu } from "./useTrayMenu";

const Harness = defineComponent({
  setup() {
    useTrayMenu();
    return () => null;
  },
});

const song: SongInfo = {
  id: "1",
  name: "Song",
  artists: ["A", "B"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "h1",
};

function lastCall() {
  const calls = mocks.updateTrayMenu.mock.calls;
  return calls[calls.length - 1]?.[0] as {
    labels: Record<string, string>;
    nowPlaying: string | null;
  };
}

function lastPlaybackCall() {
  const calls = mocks.updateTrayPlaybackState.mock.calls;
  return calls[calls.length - 1]?.[0] as {
    playing: boolean;
    tooltip: string | null;
  };
}

describe("useTrayMenu", () => {
  beforeEach(() => {
    mocks.updateTrayMenu.mockReset().mockResolvedValue(undefined);
    mocks.updateTrayPlaybackState.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
  });

  it("挂载时按当前语言推送菜单文案，无曲目时 tooltip 为空", async () => {
    mount(Harness, { global: { plugins: [createPinia(), i18n] } });
    await flushPromises();

    const call = lastCall();
    expect(call.labels.play).toBe(i18n.global.t("tray.play"));
    expect(call.labels.showHide).toBe(i18n.global.t("tray.showHide"));
    expect(call.nowPlaying).toBeNull();
  });

  it("曲目变化时推送「歌名 — 歌手」", async () => {
    const pinia = createPinia();
    mount(Harness, { global: { plugins: [pinia, i18n] } });
    const playerStore = usePlayerStore();

    playerStore.currentOnlineSong = song;
    await flushPromises();

    expect(lastCall().nowPlaying).toBe("Song — A / B");
  });

  it("播放状态变化时推送图标状态与对应 tooltip", async () => {
    const pinia = createPinia();
    mount(Harness, { global: { plugins: [pinia, i18n] } });
    const playerStore = usePlayerStore();
    await flushPromises();

    expect(lastPlaybackCall().playing).toBe(false);
    expect(lastPlaybackCall().tooltip).toBe(i18n.global.t("tray.play"));

    playerStore.isPlaying = true;
    await flushPromises();

    expect(lastPlaybackCall().playing).toBe(true);
    expect(lastPlaybackCall().tooltip).toBe(i18n.global.t("tray.pause"));
  });
});

import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongInfo } from "@/types/model";

const mocks = vi.hoisted(() => ({
  updateMediaMetadata: vi.fn(),
  revealMainWindow: vi.fn(),
  loadLocalCoverFileUrl: vi.fn(),
  cacheOnlineCover: vi.fn(),
  listeners: {} as Record<string, (event: { payload: unknown }) => void>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    mocks.listeners[name] = cb;
    return () => {};
  }),
}));
vi.mock("@/api/commands/system", () => ({
  updateMediaMetadata: (...args: unknown[]) => mocks.updateMediaMetadata(...args),
  revealMainWindow: (...args: unknown[]) => mocks.revealMainWindow(...args),
}));

vi.mock("@/api/commands/netease", () => ({
  cacheOnlineCover: (...args: unknown[]) => mocks.cacheOnlineCover(...args),
}));

vi.mock("@/utils/coverUtils", () => ({
  loadLocalCoverFileUrl: (...args: unknown[]) => mocks.loadLocalCoverFileUrl(...args),
  toFileUrl: (path: string) => `file://${path}`,
}));

import { usePlayerStore } from "@/stores/playerStore";
import { useSystemMediaControls } from "./useSystemMediaControls";

const Harness = defineComponent({
  setup() {
    useSystemMediaControls();
    return () => null;
  },
});

async function mountHarness() {
  const pinia = createPinia();
  const wrapper = mount(Harness, { global: { plugins: [pinia] } });
  await flushPromises();
  return { wrapper, playerStore: usePlayerStore() };
}

function emitMediaControl(payload: unknown) {
  mocks.listeners["media-control"]({ payload });
}

const song: SongInfo = {
  id: "1",
  name: "Song",
  artists: ["A", "B"],
  album: "Album",
  duration: 200000,
  pic_url: "http://localhost/a.jpg",
  file_hash: "h1",
};

describe("useSystemMediaControls", () => {
  beforeEach(() => {
    mocks.updateMediaMetadata.mockReset().mockResolvedValue(undefined);
    mocks.revealMainWindow.mockReset().mockResolvedValue(undefined);
    mocks.loadLocalCoverFileUrl.mockReset().mockResolvedValue("");
    mocks.cacheOnlineCover.mockReset().mockResolvedValue(null);
    mocks.listeners = {};
    localStorage.clear();
  });

  it("挂载时推送一次元数据（无曲目时清空）", async () => {
    await mountHarness();

    expect(mocks.updateMediaMetadata).toHaveBeenCalledTimes(1);
    const [{ payload }] = mocks.updateMediaMetadata.mock.calls[0];
    expect(payload.isPlaying).toBe(false);
    expect(payload.title).toBe("");
    // 空串会让 macOS 的 souvlaki 崩溃，必须是 null
    expect(payload.coverUrl).toBeNull();
  });

  it("有在线曲目时先落盘封面，再推送本地 file:// 地址", async () => {
    const pinia = createPinia();
    const wrapper = mount(Harness, { global: { plugins: [pinia] } });
    const playerStore = usePlayerStore();
    mocks.cacheOnlineCover.mockResolvedValue("/cache/a.jpg");
    playerStore.currentOnlineSong = song;
    await flushPromises();

    expect(mocks.cacheOnlineCover).toHaveBeenCalledWith({
      url: "http://localhost/a.jpg",
    });
    const calls = mocks.updateMediaMetadata.mock.calls;
    const [{ payload }] = calls[calls.length - 1];
    expect(payload.title).toBe("Song");
    expect(payload.artist).toBe("A / B");
    expect(payload.coverUrl).toBe("file:///cache/a.jpg");
    expect(payload.durationMs).toBe(200000);
    wrapper.unmount();
  });

  it("媒体键映射到播放控制路径", async () => {
    const { playerStore, wrapper } = await mountHarness();
    const toggleSpy = vi.spyOn(playerStore, "togglePlay").mockResolvedValue(undefined);
    const nextSpy = vi
      .spyOn(playerStore, "playNextOrPreviousMusic")
      .mockResolvedValue(undefined);
    const seekSpy = vi.spyOn(playerStore, "seekToPosition").mockResolvedValue(undefined);
    const volumeSpy = vi
      .spyOn(playerStore, "adjustVolume")
      .mockImplementation(async () => {});

    emitMediaControl({ action: "toggle" });
    expect(toggleSpy).toHaveBeenCalledTimes(1);

    // 未在播放时的 play 走 togglePlay；播放中的 pause/stop 也走 togglePlay
    emitMediaControl({ action: "play" });
    expect(toggleSpy).toHaveBeenCalledTimes(2);
    playerStore.isPlaying = true;
    emitMediaControl({ action: "pause" });
    expect(toggleSpy).toHaveBeenCalledTimes(3);

    emitMediaControl({ action: "next" });
    emitMediaControl({ action: "previous" });
    expect(nextSpy).toHaveBeenCalledTimes(2);

    playerStore.currentPlayTime = 30000;
    emitMediaControl({ action: "seek_relative", offset_ms: 5000 });
    expect(seekSpy).toHaveBeenCalledWith(35000);
    emitMediaControl({ action: "seek_absolute", position_ms: 1000 });
    expect(seekSpy).toHaveBeenCalledWith(1000);

    emitMediaControl({ action: "set_volume", volume: 0.5 });
    expect(volumeSpy).toHaveBeenCalledWith(50);

    emitMediaControl({ action: "raise" });
    expect(mocks.revealMainWindow).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});

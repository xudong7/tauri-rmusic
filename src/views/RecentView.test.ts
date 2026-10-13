import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import RecentView from "./RecentView.vue";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayHistoryStore } from "@/stores/playHistoryStore";
import type { MusicFile } from "@/types/model";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
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

// 封面走 IPC 异步取，测试里换成桩
vi.mock("@/utils/coverUtils", () => ({
  loadLocalCover: vi.fn().mockResolvedValue(""),
  loadOnlineCover: vi.fn().mockResolvedValue(""),
}));

const file: MusicFile = {
  id: 1,
  file_name: "Artist - Song.mp3",
  key: "k1",
  relative_path: "Artist - Song.mp3",
  title: "Song",
  artist: "Artist",
  album: "Album A",
  duration_ms: 65_000,
};

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(RecentView, {
    global: {
      plugins: [pinia, i18n],
      stubs: { "el-segmented": true, "el-popconfirm": true },
    },
  });
}

describe("RecentView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("本地条目显示曲库里的专辑与播放次数", async () => {
    const wrapper = mountView();
    useLocalMusicStore().musicFiles = [file];
    usePlayHistoryStore().recordPlay({
      source: "local",
      local: { file_name: file.file_name, title: "Song", artist: "Artist" },
    });
    await flushPromises();

    expect(wrapper.get(".track-row__album").text()).toBe("Album A");
    expect(wrapper.get(".track-row__badge").text()).toBe(
      i18n.global.t("recent.playCount", { count: 1 })
    );
  });

  it("文件已删除时退回播放时记下的专辑快照，并置灰该行", async () => {
    const wrapper = mountView();
    usePlayHistoryStore().recordPlay({
      source: "local",
      local: {
        file_name: "gone.mp3",
        title: "Gone",
        artist: "Artist",
        album: "Album B",
      },
    });
    await flushPromises();

    expect(wrapper.get(".track-row__album").text()).toBe("Album B");
    expect(wrapper.get(".track-row").classes()).toContain("is-disabled");
  });

  it("没有记录时显示空状态", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find(".track-row").exists()).toBe(false);
  });
});

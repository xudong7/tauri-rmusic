import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElMessage } from "element-plus";
import { i18n } from "@/i18n";
import { TauriCommandError } from "@/api/client";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import type { SongInfo } from "@/types/model";
import { useOnlinePlaylistActions } from "./useOnlinePlaylistActions";

const commandMocks = vi.hoisted(() => ({
  downloadMusic: vi.fn(),
  scanFiles: vi.fn(),
}));

vi.mock("@/api/commands/music", () => ({
  downloadMusic: commandMocks.downloadMusic,
}));

vi.mock("@/api/commands/file", () => ({
  scanFiles: commandMocks.scanFiles,
  getDefaultMusicDir: vi.fn(),
}));

const Harness = defineComponent({
  setup() {
    return useOnlinePlaylistActions();
  },
  template: "<div />",
});

const EXPECTED_NAME = "Artist - Track.mp3";

const song: SongInfo = {
  id: "1",
  name: "Track",
  artists: ["Artist"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "hash",
};

function mountHarness() {
  const pinia = createPinia();
  const wrapper = mount(Harness, { global: { plugins: [pinia, i18n] } });
  const localStore = useLocalMusicStore(pinia);
  localStore.currentDirectory = "/music";
  return { wrapper, localStore, playlistStore: usePlaylistStore(pinia) };
}

describe("useOnlinePlaylistActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    commandMocks.downloadMusic.mockReset();
    commandMocks.scanFiles.mockReset();
    commandMocks.scanFiles.mockResolvedValue([]);
  });

  it("曲库里没有这首歌时，先下载再写入歌单", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([{ id: 1, file_name: EXPECTED_NAME }]);
    const { wrapper, playlistStore } = mountHarness();

    const result = await wrapper.vm.addOnlineSongToPlaylist("new", song);

    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();
    expect(result.outcome).toBe("added");
    const created = playlistStore.playlists[0];
    expect(created.items).toEqual([{ type: "local", file_name: EXPECTED_NAME }]);
  });

  it("曲库里已有这首歌时不再下载", async () => {
    const { wrapper, localStore, playlistStore } = mountHarness();
    const list = playlistStore.createPlaylist("我的歌单");
    localStore.musicFiles = [{ id: 1, file_name: EXPECTED_NAME }];

    const result = await wrapper.vm.addOnlineSongToPlaylist(list.id, song);

    expect(commandMocks.downloadMusic).not.toHaveBeenCalled();
    expect(result.outcome).toBe("added");
    expect(playlistStore.getPlaylist(list.id)?.items).toHaveLength(1);
  });

  it("歌曲已在歌单中时返回 already，并带上歌单名", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([{ id: 1, file_name: EXPECTED_NAME }]);
    const { wrapper, playlistStore } = mountHarness();
    const list = playlistStore.createPlaylist("我的歌单");

    const first = await wrapper.vm.addOnlineSongToPlaylist(list.id, song);
    const second = await wrapper.vm.addOnlineSongToPlaylist(list.id, song);

    expect(first.outcome).toBe("added");
    expect(second.outcome).toBe("already");
    expect(second.playlistName).toBe("我的歌单");
    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();
    expect(playlistStore.getPlaylist(list.id)?.items).toHaveLength(1);
  });

  it("下载失败时不写入歌单", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValue(
      new TauriCommandError("download_music", "network error")
    );
    const { wrapper, playlistStore } = mountHarness();
    const list = playlistStore.createPlaylist("我的歌单");

    const result = await wrapper.vm.addOnlineSongToPlaylist(list.id, song);

    expect(result.outcome).toBe("failed");
    expect(playlistStore.getPlaylist(list.id)?.items).toHaveLength(0);
  });
});

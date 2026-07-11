import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { SongInfo } from "@/types/model";
import { useLocalMusicStore } from "@/stores/localMusicStore";
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

describe("useOnlinePlaylistActions", () => {
  it("refreshes the current library after a successful download", async () => {
    commandMocks.downloadMusic.mockResolvedValue("Artist - Track.mp3");
    commandMocks.scanFiles.mockResolvedValue([]);
    const pinia = createPinia();
    const wrapper = mount(Harness, { global: { plugins: [pinia, i18n] } });
    const localStore = useLocalMusicStore(pinia);
    localStore.currentDirectory = "/music";
    const song: SongInfo = {
      id: "1",
      name: "Track",
      artists: ["Artist"],
      album: "Album",
      duration: 1000,
      pic_url: "",
      file_hash: "hash",
    };

    await wrapper.vm.downloadOnlineSong(song);

    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();
    expect(commandMocks.scanFiles).toHaveBeenCalledWith({
      path: "/music",
      defaultDirectory: null,
    });
  });
});

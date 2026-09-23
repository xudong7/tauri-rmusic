import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElMessage } from "element-plus";
import { i18n } from "@/i18n";
import { TauriCommandError } from "@/api/client";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import type { SongInfo } from "@/types/model";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import OnlineMusicList from "./OnlineMusicList.vue";

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

/** el-dropdown 系列没有全局注册，真组件会牵进 popper/scrollbar，桩掉即可 ——
    但要点得动 command 事件，所以自己声明一个。 */
const DropdownStub = defineComponent({
  name: "ElDropdown",
  emits: ["command"],
  template: "<div><slot /></div>",
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

const t = i18n.global.t;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mountList(songs: SongInfo[] = [song]) {
  const pinia = createPinia();
  const wrapper = mount(OnlineMusicList, {
    props: {
      onlineSongs: songs,
      currentSong: null,
      isPlaying: false,
      loading: false,
      totalCount: songs.length,
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        "el-dropdown": DropdownStub,
        "el-dropdown-menu": true,
        "el-dropdown-item": true,
      },
    },
  });
  const localStore = useLocalMusicStore(pinia);
  localStore.currentDirectory = "/music";
  return { wrapper, localStore };
}

function downloadButton(wrapper: ReturnType<typeof mountList>["wrapper"]) {
  return wrapper.get(".download-action");
}

function busyKeysOf(wrapper: ReturnType<typeof mountList>["wrapper"]) {
  return wrapper.findComponent(TrackList).props("busyKeys") as Set<string>;
}

describe("OnlineMusicList 的下载按钮", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    commandMocks.downloadMusic.mockReset();
    commandMocks.scanFiles.mockReset();
    commandMocks.scanFiles.mockResolvedValue([]);
  });

  it("没下载过时是下载箭头", () => {
    const { wrapper } = mountList();
    const button = downloadButton(wrapper);

    expect(button.attributes("aria-label")).toBe(t("common.download"));
    expect(button.find(".check-icon").exists()).toBe(false);
    expect(button.find(".in-library-icon").exists()).toBe(false);
  });

  it("点击后转圈，完成后变成打勾", async () => {
    const deferred = createDeferred<string>();
    commandMocks.downloadMusic.mockReturnValue(deferred.promise);
    const { wrapper } = mountList();

    await downloadButton(wrapper).trigger("click");
    await flushPromises();

    expect(downloadButton(wrapper).attributes("aria-label")).toBe(
      t("download.downloading")
    );
    expect(downloadButton(wrapper).classes()).toContain("is-loading");

    deferred.resolve(EXPECTED_NAME);
    await flushPromises();

    const done = downloadButton(wrapper);
    expect(done.attributes("aria-label")).toBe(t("download.done"));
    expect(done.find(".check-icon").exists()).toBe(true);
    expect(done.classes()).not.toContain("is-loading");
  });

  it("曲库里已有的歌显示「已在曲库」", async () => {
    const { wrapper, localStore } = mountList();
    localStore.musicFiles = [{ id: 1, file_name: EXPECTED_NAME }];
    await flushPromises();

    const button = downloadButton(wrapper);
    expect(button.attributes("aria-label")).toBe(t("download.inLibrary"));
    expect(button.find(".in-library-icon").exists()).toBe(true);
  });

  it("失败后显示可重试，再点一次会重发请求", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValue(
      new TauriCommandError("download_music", "network error")
    );
    const { wrapper } = mountList();

    await downloadButton(wrapper).trigger("click");
    await flushPromises();

    expect(downloadButton(wrapper).attributes("aria-label")).toBe(t("download.failed"));
    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();

    await downloadButton(wrapper).trigger("click");
    await flushPromises();

    expect(commandMocks.downloadMusic).toHaveBeenCalledTimes(2);
  });

  it("下载中与刚完成的行都交给 TrackList 去钉住操作簇", async () => {
    const deferred = createDeferred<string>();
    commandMocks.downloadMusic.mockReturnValue(deferred.promise);
    const { wrapper } = mountList();

    await downloadButton(wrapper).trigger("click");
    await flushPromises();
    expect(busyKeysOf(wrapper).has(song.id)).toBe(true);

    deferred.resolve(EXPECTED_NAME);
    await flushPromises();
    // 完成后仍要钉住：打勾是唯一的成功提示，只有悬停才看得见就等于没有
    expect(busyKeysOf(wrapper).has(song.id)).toBe(true);
  });

  it("「已在曲库」的行不钉住，避免整列表常驻按钮", async () => {
    const { wrapper, localStore } = mountList();
    localStore.musicFiles = [{ id: 1, file_name: EXPECTED_NAME }];
    await flushPromises();

    expect(busyKeysOf(wrapper).size).toBe(0);
  });

  it("加入歌单后 Plus 闪一下打勾", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([{ id: 1, file_name: EXPECTED_NAME }]);
    const { wrapper } = mountList();

    expect(wrapper.get(".playlist-action").find(".check-icon").exists()).toBe(false);

    wrapper.findComponent(DropdownStub).vm.$emit("command", "new");
    await flushPromises();

    expect(wrapper.get(".playlist-action").find(".check-icon").exists()).toBe(true);
  });

  it("加入歌单失败时按钮不显示成功", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValue(
      new TauriCommandError("download_music", "network error")
    );
    const { wrapper } = mountList();

    wrapper.findComponent(DropdownStub).vm.$emit("command", "new");
    await flushPromises();

    expect(wrapper.get(".playlist-action").find(".check-icon").exists()).toBe(false);
  });
});

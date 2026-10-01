import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElMessage } from "element-plus";
import { i18n } from "@/i18n";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import type { MusicFile } from "@/types/model";
import MusicList from "./MusicList.vue";

const commandMocks = vi.hoisted(() => ({
  deleteMusicFile: vi.fn(),
  scanFiles: vi.fn(),
}));

vi.mock("@/api/commands/file", () => ({
  deleteMusicFile: commandMocks.deleteMusicFile,
  scanFiles: commandMocks.scanFiles,
  getDefaultMusicDir: vi.fn(),
}));

// 封面走 IPC 异步取，测试里换成桩
vi.mock("@/utils/coverUtils", () => ({
  loadLocalCover: vi.fn().mockResolvedValue(""),
}));

/** el-popconfirm 没在全局注册；自己声明一个能点得动 confirm 事件的桩 */
const PopconfirmStub = defineComponent({
  name: "ElPopconfirm",
  emits: ["confirm"],
  template: "<div><slot name='reference' /></div>",
});

const file: MusicFile = {
  id: 1,
  file_name: "Artist - Song.mp3",
  key: "k1",
  relative_path: "Artist - Song.mp3",
  title: "Song",
  artist: "Artist",
  album: "Album",
  duration_ms: 1000,
};

function mountMusicList(files: MusicFile[] = [file]) {
  const pinia = createPinia();
  // 删除命令带的 defaultDirectory 取自 store（库根目录），与下载走同一个来源；
  // getDefaultDirectory 那个 prop 只给封面解析用。
  const localStore = useLocalMusicStore(pinia);
  localStore.defaultDirectory = "/library";
  // 曲库已加载的状态：refreshCurrentDirectory 在没有当前目录时是空操作，
  // 而删除后要重扫的正是这个目录。
  localStore.currentDirectory = "/library/music";
  const wrapper = mount(MusicList, {
    props: {
      musicFiles: files,
      currentMusic: null,
      isPlaying: false,
      showImportButton: true,
      getDefaultDirectory: () => "/library",
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        "el-popconfirm": PopconfirmStub,
        "el-dropdown": true,
        "el-dropdown-menu": true,
        "el-dropdown-item": true,
        "el-empty": true,
        "el-skeleton": true,
      },
    },
  });
  return wrapper;
}

describe("MusicList 的删除", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    commandMocks.deleteMusicFile.mockReset().mockResolvedValue(undefined);
    commandMocks.scanFiles.mockReset().mockResolvedValue([]);
  });

  // 这是全应用唯一会动用户文件的按钮，接错线（比如传错文件名或传了整个数组）
  // 的代价是不可逆的，所以把「按钮 → 命令」这一跳钉住。
  it("确认后按文件名调用删除命令，并刷新曲库", async () => {
    const wrapper = mountMusicList();

    wrapper.findComponent(PopconfirmStub).vm.$emit("confirm");
    await flushPromises();

    expect(commandMocks.deleteMusicFile).toHaveBeenCalledWith({
      fileName: "Artist - Song.mp3",
      defaultDirectory: "/library",
    });
    // 刷新走的是当前目录的重扫
    expect(commandMocks.scanFiles).toHaveBeenCalledWith({
      path: "/library/music",
      defaultDirectory: "/library",
    });
  });

  it("删除失败时弹错误提示，不谎报成功", async () => {
    const errorSpy = vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    const successSpy = vi
      .spyOn(ElMessage, "success")
      .mockImplementation(() => ({}) as never);
    commandMocks.deleteMusicFile.mockRejectedValue(new Error("delete file error: nope"));

    const wrapper = mountMusicList();
    wrapper.findComponent(PopconfirmStub).vm.$emit("confirm");
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(successSpy).not.toHaveBeenCalled();
  });

  it("删除键是危险色，不是普通图标色", () => {
    const wrapper = mountMusicList();

    expect(wrapper.get(".delete-action").classes()).toContain("app-icon-button--danger");
  });
});

// 空状态要能看到 description 与槽内按钮，因此不再用默认的空壳桩
const EmptyStub = defineComponent({
  name: "ElEmpty",
  props: { description: { type: String, default: "" } },
  template:
    "<div class='empty-stub'><p class='empty-desc'>{{ description }}</p><slot /></div>",
});

const ButtonStub = defineComponent({
  name: "ElButton",
  emits: ["click"],
  template: "<button type='button' @click=\"$emit('click')\"><slot /></button>",
});

function mountWithEmptyState(props: {
  searchKeyword?: string;
  errorMessage?: string;
  showImportButton?: boolean;
}) {
  const pinia = createPinia();
  return mount(MusicList, {
    props: { musicFiles: [], currentMusic: null, isPlaying: false, ...props },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        "el-popconfirm": PopconfirmStub,
        "el-dropdown": true,
        "el-dropdown-menu": true,
        "el-dropdown-item": true,
        "el-empty": EmptyStub,
        "el-button": ButtonStub,
        "el-skeleton": true,
      },
    },
  });
}

describe("MusicList 的空状态", () => {
  it("曲库为空时引导导入", () => {
    const wrapper = mountWithEmptyState({ showImportButton: true });
    expect(wrapper.get(".empty-desc").text()).toBe(i18n.global.t("musicList.empty"));
  });

  it("搜索无命中时提示关键词，而不是谎报曲库为空", () => {
    const wrapper = mountWithEmptyState({ searchKeyword: "jay" });
    expect(wrapper.get(".empty-desc").text()).toBe(
      i18n.global.t("musicList.noSearchResult", { keyword: "jay" })
    );
  });

  it("加载失败时给出错误与重试按钮", async () => {
    const wrapper = mountWithEmptyState({ errorMessage: "boom", showImportButton: true });
    expect(wrapper.get(".empty-desc").text()).toBe(
      i18n.global.t("errors.loadMusicFailed")
    );

    await wrapper.get(".empty-stub button").trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
  });
});

import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { IMMERSIVE_CONTROLS_IDLE_MS } from "@/constants";
import type { SongInfo } from "@/types/model";
import ImmersiveView from "./ImmersiveView.vue";

// 沉浸页挂载时会走 Tauri 窗口 API 与封面加载器，测试里都换成桩。
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("@/utils/coverUtils", () => ({
  loadLocalCover: vi.fn().mockResolvedValue(""),
}));

// 歌名/歌手跳转要先确保在线服务，再解析 id；这些命令都换成桩。
const api = vi.hoisted(() => ({
  ensureOnlineService: vi.fn().mockResolvedValue(undefined),
  checkOnlineServiceStatus: vi
    .fn()
    .mockResolvedValue({ available: true, status_code: 200, message: "" }),
  searchOnlineAlbums: vi.fn().mockResolvedValue({
    albums: [
      {
        id: "al1",
        name: "Album",
        pic_url: "",
        size: 1,
        artist: "Artist",
        publish_time: 0,
        company: "",
      },
    ],
    total: 1,
  }),
  searchOnlineArtists: vi.fn().mockResolvedValue({
    artists: [{ id: "ar1", name: "Artist", pic_url: "" }],
    total: 1,
  }),
}));

vi.mock("@/api/commands/netease", () => ({
  ensureOnlineService: api.ensureOnlineService,
  checkOnlineServiceStatus: api.checkOnlineServiceStatus,
  searchOnlineAlbums: api.searchOnlineAlbums,
  searchOnlineArtists: api.searchOnlineArtists,
}));

const song: SongInfo = {
  id: "s1",
  name: "Song",
  artists: ["Artist"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "h1",
};

// useArtistNavigation/useAlbumNavigation 依赖 vue-router，用内存路由即可。
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: { template: "<div />" } },
    { path: "/artist/:id", name: "Artist", component: { template: "<div />" } },
    {
      path: "/online/album/:id",
      name: "OnlineAlbum",
      component: { template: "<div />" },
    },
  ],
});

async function mountImmersiveView(currentSong: SongInfo | null = null) {
  const wrapper = mount(ImmersiveView, {
    props: { currentSong, currentMusic: null, isPlaying: false, volume: 50 },
    global: {
      plugins: [createPinia(), i18n, router],
      // 刻意不 stub LyricView：它曾在 setup 阶段因 watch immediate 访问
      // 未初始化的 ref 抛错，stub 掉会让这类错误从测试里消失，
      // 而真实运行时整棵沉浸页都渲染不出来。
    },
  });
  await flushPromises();
  return wrapper;
}

describe("ImmersiveView 退出入口", () => {
  it("点击返回按钮 emit exit", async () => {
    const wrapper = await mountImmersiveView();

    await wrapper.get(".back-btn").trigger("click");

    expect(wrapper.emitted("exit")).toHaveLength(1);
  });

  // 图标按钮没有文本，必须靠 aria-label 补上，否则读屏只会念出一个「按钮」。
  it("返回按钮带可访问名", async () => {
    const wrapper = await mountImmersiveView();

    expect(wrapper.get(".back-btn").attributes("aria-label")).toBe(
      i18n.global.t("common.back")
    );
  });

  it("点击音量键 emit volume-change", async () => {
    const wrapper = await mountImmersiveView();

    await wrapper.get(".immersive-volume-btn").trigger("click");

    expect(wrapper.emitted("volume-change")).toEqual([[0]]);
  });
});

describe("ImmersiveView 底部控制条的闲置隐藏", () => {
  // 控制条默认可见、闲置才隐藏。反过来的做法（默认藏、悬停才出）要用户先猜到
  // 「底部能悬停」，而进沉浸页的第一眼是没有播放控件的。
  it("刚进入时不隐藏", async () => {
    const wrapper = await mountImmersiveView();

    expect(wrapper.classes()).not.toContain("is-controls-idle");
  });

  it("闲置一段时间后隐藏", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountImmersiveView();

      vi.advanceTimersByTime(IMMERSIVE_CONTROLS_IDLE_MS);
      await flushPromises();

      expect(wrapper.classes()).toContain("is-controls-idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("指针一动立刻叫回来，并重新计时", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountImmersiveView();
      vi.advanceTimersByTime(IMMERSIVE_CONTROLS_IDLE_MS);
      await flushPromises();
      expect(wrapper.classes()).toContain("is-controls-idle");

      window.dispatchEvent(new Event("pointermove"));
      await flushPromises();
      expect(wrapper.classes()).not.toContain("is-controls-idle");

      // 重新计时：还没到点就不该再次隐藏
      vi.advanceTimersByTime(IMMERSIVE_CONTROLS_IDLE_MS / 2);
      await flushPromises();
      expect(wrapper.classes()).not.toContain("is-controls-idle");
    } finally {
      vi.useRealTimers();
    }
  });

  // 沉浸页是 v-if 挂载的，每进出一次就多一份全局监听——正是 useWindowControls
  // 那个 onResized 泄漏的同款问题，这里从一开始就守住。
  it("卸载时摘掉全局监听", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const wrapper = await mountImmersiveView();

    wrapper.unmount();

    const count = (spy: typeof addSpy, type: string) =>
      spy.mock.calls.filter(([event]) => event === type).length;
    for (const type of ["pointermove", "pointerdown", "keydown"]) {
      expect(count(removeSpy, type), `${type} 应被摘掉`).toBe(count(addSpy, type));
    }
  });
});

describe("ImmersiveView 歌名/歌手跳转", () => {
  it("有专辑信息时歌名渲染为可点击链接", async () => {
    const wrapper = await mountImmersiveView(song);

    expect(wrapper.get(".song-title-text").classes()).toContain("is-link");
  });

  it("点击歌名跳专辑页并退出沉浸模式", async () => {
    await router.push("/");
    const wrapper = await mountImmersiveView(song);

    await wrapper.get(".song-title-text").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("OnlineAlbum");
    expect(router.currentRoute.value.params.id).toBe("al1");
    expect(wrapper.emitted("exit")).toHaveLength(1);
  });

  it("点击歌手跳歌手页并退出沉浸模式", async () => {
    await router.push("/");
    const wrapper = await mountImmersiveView(song);

    await wrapper.get(".artist-part").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("Artist");
    expect(router.currentRoute.value.params.id).toBe("ar1");
    expect(wrapper.emitted("exit")).toHaveLength(1);
  });
});

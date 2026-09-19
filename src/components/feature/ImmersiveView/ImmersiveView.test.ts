import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
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

// useArtistNavigation 依赖 vue-router，用内存路由即可，不需要真实页面。
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: { template: "<div />" } }],
});

async function mountImmersiveView() {
  const wrapper = mount(ImmersiveView, {
    props: { currentSong: null, currentMusic: null, isPlaying: false, volume: 50 },
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

  // 图标按钮没有文本，el-tooltip 给的是 aria-describedby（描述）而不是名称，
  // 必须靠 aria-label 补上，否则读屏只会念出一个没有名字的「按钮」。
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

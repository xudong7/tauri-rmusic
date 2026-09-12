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
    props: { currentSong: null, currentMusic: null, isPlaying: false },
    global: {
      plugins: [createPinia(), i18n, router],
      stubs: { LyricView: true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("ImmersiveView 退出入口", () => {
  it("顶部 chevron 与左下角折角各提供一个退出入口", async () => {
    const wrapper = await mountImmersiveView();

    expect(wrapper.find(".back-btn").exists()).toBe(true);
    expect(wrapper.find(".corner-exit-btn").exists()).toBe(true);
  });

  it("两个入口点击后都 emit exit", async () => {
    const wrapper = await mountImmersiveView();

    await wrapper.get(".back-btn").trigger("click");
    await wrapper.get(".corner-exit-btn").trigger("click");

    expect(wrapper.emitted("exit")).toHaveLength(2);
  });

  // el-tooltip 经 ElOnlyChild 把事件与 aria 属性合并到子节点上，而不是套一层
  // wrapper。这条断言把这个约定钉住：一旦 tooltip 变成外层 <span>，折角按钮的
  // 绝对定位包含块就会从 .immersive-view 变成那个 span，左下角按钮会跑位。
  it("折角入口是原生 button，未被 tooltip 包一层，且有可访问名", async () => {
    const wrapper = await mountImmersiveView();
    const button = wrapper.get(".corner-exit-btn");

    expect(button.element.tagName).toBe("BUTTON");
    expect(button.element.parentElement?.className).toContain("immersive-view");
    expect(button.attributes("aria-label")).toBe(i18n.global.t("common.back"));
    expect(button.find("svg").exists()).toBe(true);
  });
});

import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { SearchScope } from "@/types/model";
import HeaderBar from "./HeaderBar.vue";

// 顶栏挂载时会走 Tauri 窗口 API，测试里换成桩。
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

vi.mock("@/api/commands/netease", () => ({
  checkOnlineServiceStatus: vi
    .fn()
    .mockResolvedValue({ available: true, status_code: 200, message: "" }),
  ensureOnlineService: vi.fn().mockResolvedValue(undefined),
}));

function mountHeader(searchScope: SearchScope | null) {
  return mount(HeaderBar, {
    props: { searchScope, isDarkMode: false },
    global: { plugins: [createPinia(), i18n] },
  });
}

describe("HeaderBar 在线服务指示灯", () => {
  // 槽位一消失，右侧宽度就变，中间居中的搜索框会跟着左右移动：
  // 曲库与在线音乐两个视图的搜索框位置必须一致。
  it("槽位在所有视图都占位", () => {
    for (const scope of ["local", "online", "playlist", null] as const) {
      expect(mountHeader(scope).find(".service-status-slot").exists()).toBe(true);
    }
  });

  it("指示灯只在在线搜索视图出现", () => {
    expect(mountHeader("online").find(".service-status").exists()).toBe(true);
    expect(mountHeader("local").find(".service-status").exists()).toBe(false);
  });
});

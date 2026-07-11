import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import SettingsWindow from "./SettingsWindow.vue";

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@/api/commands/music", () => ({
  clearOnlineAudioCache: vi.fn(),
  getOnlineAudioCachePath: vi.fn().mockResolvedValue("/cache"),
  getOnlineAudioCacheSize: vi.fn().mockResolvedValue(1024),
}));

vi.mock("@/api/commands/file", () => ({
  getDefaultMusicDir: vi.fn().mockResolvedValue("/library/music"),
  scanFiles: vi.fn().mockResolvedValue([]),
}));

describe("SettingsWindow", () => {
  it("uses the shared page header and renders each settings group", async () => {
    const wrapper = mount(SettingsWindow, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();

    expect(wrapper.get(".page-header__title").text()).toBe(
      i18n.global.t("settings.title")
    );
    expect(wrapper.findAll(".settings-section")).toHaveLength(5);
    expect(wrapper.findAll(".setting-row").length).toBeGreaterThanOrEqual(5);
    expect(wrapper.text()).toContain("1.0 KB");
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n";
import { useShortcutsHelp } from "@/composables/useShortcutsHelp";
import ShortcutsOverlay from "./ShortcutsOverlay.vue";

function mountOverlay() {
  return mount(ShortcutsOverlay, {
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
}

describe("ShortcutsOverlay", () => {
  afterEach(() => {
    useShortcutsHelp().closeShortcutsHelp();
  });

  it("打开后列出全部快捷键", async () => {
    const wrapper = mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();

    expect(wrapper.find(".shortcuts-dialog").exists()).toBe(true);
    expect(wrapper.findAll(".shortcuts-dialog__row")).toHaveLength(6);
    expect(wrapper.text()).toContain(i18n.global.t("shortcuts.title"));
  });

  it("Escape 关闭浮层", async () => {
    const wrapper = mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();

    expect(wrapper.find(".shortcuts-dialog").exists()).toBe(false);
    expect(useShortcutsHelp().isShortcutsHelpOpen.value).toBe(false);
  });

  it("点击背板关闭浮层", async () => {
    const wrapper = mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();

    await wrapper.get(".shortcuts-backdrop").trigger("mousedown");
    await flushPromises();

    expect(wrapper.find(".shortcuts-dialog").exists()).toBe(false);
  });
});

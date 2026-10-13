import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n";
import { useShortcutsHelp } from "@/composables/useShortcutsHelp";
import ShortcutsOverlay from "./ShortcutsOverlay.vue";

// 挂到 document.body 上：脱离文档的元素拿不到焦点，测不了焦点行为
function mountOverlay() {
  return mount(ShortcutsOverlay, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
}

describe("ShortcutsOverlay", () => {
  afterEach(() => {
    useShortcutsHelp().closeShortcutsHelp();
    document.body.innerHTML = "";
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

  it("打开时把应用主体设为惰性，关闭后还原", async () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);

    mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();
    expect(app.hasAttribute("inert")).toBe(true);
    expect(app.getAttribute("aria-hidden")).toBe("true");

    useShortcutsHelp().closeShortcutsHelp();
    await flushPromises();
    expect(app.hasAttribute("inert")).toBe(false);
    expect(app.hasAttribute("aria-hidden")).toBe(false);
    app.remove();
  });

  it("Tab 锁在浮层里（jsdom 不实现 Tab 导航，这里直接看 preventDefault）", async () => {
    const wrapper = mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();

    const dialog = wrapper.get(".shortcuts-dialog").element;
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(wrapper.get(".shortcuts-dialog__close").element);
  });

  it("关闭后焦点回到打开前的元素", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = mountOverlay();
    useShortcutsHelp().openShortcutsHelp();
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get(".shortcuts-dialog__close").element);

    useShortcutsHelp().closeShortcutsHelp();
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

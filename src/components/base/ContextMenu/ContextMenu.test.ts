import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContextMenu from "./ContextMenu.vue";
import { useContextMenu } from "@/composables/useContextMenu";

function mountMenu() {
  return mount(ContextMenu, { global: { stubs: { teleport: true } } });
}

describe("ContextMenu", () => {
  beforeEach(() => {
    useContextMenu().close();
  });

  it("打开后渲染菜单项，点击触发动作并关闭", async () => {
    const wrapper = mountMenu();
    const action = vi.fn();
    useContextMenu().open(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }), [
      { key: "a", label: "Action A", action },
      { key: "b", label: "Disabled", disabled: true },
    ]);
    await flushPromises();

    const items = wrapper.findAll(".context-menu__item");
    expect(items).toHaveLength(2);
    await items[0].trigger("click");

    expect(action).toHaveBeenCalledOnce();
    expect(wrapper.find(".context-menu").exists()).toBe(false);
  });

  it("Escape 关闭菜单", async () => {
    const wrapper = mountMenu();
    useContextMenu().open(new MouseEvent("contextmenu"), [{ key: "a", label: "A" }]);
    await flushPromises();
    expect(wrapper.find(".context-menu").exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();

    expect(wrapper.find(".context-menu").exists()).toBe(false);
  });

  it("全部禁用时不弹空菜单", async () => {
    const wrapper = mountMenu();
    useContextMenu().open(new MouseEvent("contextmenu"), [
      { key: "a", label: "A", disabled: true },
    ]);
    await flushPromises();

    expect(wrapper.find(".context-menu").exists()).toBe(false);
  });
});

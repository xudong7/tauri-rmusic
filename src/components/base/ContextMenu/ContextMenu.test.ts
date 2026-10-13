import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContextMenu from "./ContextMenu.vue";
import { useContextMenu } from "@/composables/useContextMenu";

// 挂到 document.body 上：脱离文档的元素拿不到焦点，测不了焦点行为
function mountMenu() {
  return mount(ContextMenu, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  });
}

describe("ContextMenu", () => {
  beforeEach(() => {
    useContextMenu().close();
  });

  afterEach(() => {
    useContextMenu().close();
    document.body.innerHTML = "";
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

  // 焦点用例不能用 teleport 桩：桩每次重渲染都会重建节点，刚 focus 的元素
  // 下一帧就成了游离节点，焦点自然丢失。用真实 teleport，内容进 body，
  // 断言也改从 document 上查。
  it("关闭后焦点回到打开菜单的元素", async () => {
    mount(ContextMenu, { attachTo: document.body });
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    useContextMenu().open(new MouseEvent("contextmenu"), [{ key: "a", label: "A" }]);
    await flushPromises();
    expect(document.activeElement).toBe(document.querySelector(".context-menu__item"));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    opener.remove();
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

describe("ContextMenu 二级菜单", () => {
  beforeEach(() => {
    useContextMenu().close();
  });

  it("悬停展开子菜单，点击子项触发动作并关闭", async () => {
    const wrapper = mountMenu();
    const childAction = vi.fn();
    useContextMenu().open(new MouseEvent("contextmenu"), [
      {
        key: "add",
        label: "Add to playlist",
        children: [{ key: "add-1", label: "List 1", action: childAction }],
      },
    ]);
    await flushPromises();

    await wrapper.get(".context-menu__item").trigger("mouseenter");
    await flushPromises();

    const submenuItems = wrapper.findAll(".context-menu__submenu .context-menu__item");
    expect(submenuItems).toHaveLength(1);
    expect(submenuItems[0].text()).toBe("List 1");

    await submenuItems[0].trigger("click");
    expect(childAction).toHaveBeenCalledOnce();
    expect(wrapper.find(".context-menu").exists()).toBe(false);
  });
});

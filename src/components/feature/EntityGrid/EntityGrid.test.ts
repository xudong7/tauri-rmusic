import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EntityGrid from "./EntityGrid.vue";
import EntityCard from "./EntityCard.vue";
import type { EntityCardModel } from "./types";

function cards(count: number): EntityCardModel[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `entity-${index}`,
    kind: "playlist",
    title: `Playlist ${index}`,
    subtitle: "Creator",
    metaLabel: "10 songs",
    coverUrl: "",
  }));
}

describe("EntityGrid", () => {
  it("renders one card per item", () => {
    const wrapper = mount(EntityGrid, { props: { items: cards(4) } });
    expect(wrapper.find("[data-render-mode='grid']").exists()).toBe(true);
    expect(wrapper.findAllComponents(EntityCard)).toHaveLength(4);
  });

  it("shows the empty slot when there are no items", () => {
    const wrapper = mount(EntityGrid, {
      props: { items: [] },
      slots: { empty: '<p class="empty-stub">nothing</p>' },
    });
    expect(wrapper.find(".empty-stub").exists()).toBe(true);
    expect(wrapper.find("[data-render-mode='empty']").exists()).toBe(true);
  });

  it("prefers the loading slot while the first page is in flight", () => {
    const wrapper = mount(EntityGrid, {
      props: { items: [], loading: true },
      slots: {
        loading: '<p class="loading-stub">loading</p>',
        empty: '<p class="empty-stub">nothing</p>',
      },
    });
    expect(wrapper.find(".loading-stub").exists()).toBe(true);
    expect(wrapper.find(".empty-stub").exists()).toBe(false);
  });

  it("emits nearEnd when the container is scrolled to the bottom", async () => {
    const wrapper = mount(EntityGrid, { props: { items: cards(4) } });
    const scroller = wrapper.find(".entity-grid__scroll").element as HTMLElement;

    // jsdom 不做布局，手动摆出"剩余不足阈值"的几何关系。
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });
    scroller.scrollTop = 200; // 剩余 0px < 220px 阈值

    await wrapper.find(".entity-grid__scroll").trigger("scroll");
    expect(wrapper.emitted("nearEnd")).toHaveLength(1);
  });

  it("does not emit nearEnd while far from the bottom", async () => {
    const wrapper = mount(EntityGrid, { props: { items: cards(4) } });
    const scroller = wrapper.find(".entity-grid__scroll").element as HTMLElement;

    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 800, configurable: true });
    scroller.scrollTop = 0; // 剩余 1200px

    await wrapper.find(".entity-grid__scroll").trigger("scroll");
    expect(wrapper.emitted("nearEnd")).toBeUndefined();
  });

  it("forwards card activation to the consumer", () => {
    const wrapper = mount(EntityGrid, { props: { items: cards(2) } });
    return wrapper
      .findAllComponents(EntityCard)[1]
      .trigger("click")
      .then(() => {
        const events = wrapper.emitted("activate");
        expect(events).toHaveLength(1);
        expect((events?.[0][0] as EntityCardModel).key).toBe("entity-1");
      });
  });
});

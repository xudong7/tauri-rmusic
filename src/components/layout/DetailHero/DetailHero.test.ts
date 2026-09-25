import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DetailHero from "./DetailHero.vue";

function mountHero(props: Record<string, unknown> = {}, slots?: Record<string, string>) {
  return mount(DetailHero, {
    props: {
      coverUrl: "",
      title: "Blood Blockade Battlefront (Original Soundtrack)",
      ...props,
    },
    slots,
  });
}

describe("DetailHero", () => {
  it("渲染类型、标题与元信息", () => {
    const wrapper = mountHero({ eyebrow: "专辑", meta: "岩崎太整 · 24 首" });

    expect(wrapper.get(".detail-hero__eyebrow").text()).toBe("专辑");
    expect(wrapper.get(".detail-hero__title").text()).toContain(
      "Blood Blockade Battlefront"
    );
    expect(wrapper.get(".detail-hero__meta").text()).toBe("岩崎太整 · 24 首");
  });

  it("没有元信息时不渲染那一行", () => {
    expect(mountHero().find(".detail-hero__meta").exists()).toBe(false);
  });

  // 没传返回文案时不该凭空多出一个返回键——歌单页的返回目标是搜索，
  // 而这一层不该替调用方假设。
  it("只有传了 backLabel 才渲染返回键", async () => {
    expect(mountHero().find(".detail-hero__back").exists()).toBe(false);

    const wrapper = mountHero({ backLabel: "返回搜索" });
    await wrapper.get(".detail-hero__back").trigger("click");

    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  // 调用方塞进来的次要操作（歌单页的收藏）与返回键同处右端那一列
  it("actions 插槽渲染在右端，没给插槽时不渲染容器", () => {
    const withoutSlot = mountHero({ backLabel: "返回" });
    expect(withoutSlot.find(".detail-hero__actions").exists()).toBe(false);

    const withSlot = mountHero(
      { backLabel: "返回" },
      { actions: '<button class="extra">收藏</button>' }
    );
    const side = withSlot.get(".detail-hero__side");
    expect(side.find(".detail-hero__actions .extra").exists()).toBe(true);
    expect(side.find(".detail-hero__back").exists()).toBe(true);
  });
});

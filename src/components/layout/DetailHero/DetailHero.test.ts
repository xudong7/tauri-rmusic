import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DetailHero from "./DetailHero.vue";

function mountHero(props: Record<string, unknown> = {}) {
  return mount(DetailHero, {
    props: {
      coverUrl: "",
      title: "Blood Blockade Battlefront (Original Soundtrack)",
      playLabel: "播放全部",
      shuffleLabel: "随机播放",
      ...props,
    },
  });
}

describe("DetailHero", () => {
  it("渲染类型、标题与元信息", () => {
    const wrapper = mountHero({
      eyebrow: "专辑",
      meta: "岩崎太整 · 24 首",
    });

    expect(wrapper.get(".detail-hero__eyebrow").text()).toBe("专辑");
    expect(wrapper.get(".detail-hero__title").text()).toContain(
      "Blood Blockade Battlefront"
    );
    expect(wrapper.get(".detail-hero__meta").text()).toBe("岩崎太整 · 24 首");
  });

  it("没有元信息时不渲染那一行", () => {
    expect(mountHero().find(".detail-hero__meta").exists()).toBe(false);
  });

  it("点播放与随机各 emit 一次", async () => {
    const wrapper = mountHero();

    await wrapper.get(".detail-hero__play").trigger("click");
    await wrapper.get(".detail-hero__shuffle").trigger("click");

    expect(wrapper.emitted("play")).toHaveLength(1);
    expect(wrapper.emitted("shuffle")).toHaveLength(1);
  });

  // 没传返回文案时不该凭空多出一个返回键——歌手页和专辑页的返回目标不同
  it("只有传了 backLabel 才渲染返回键", async () => {
    expect(mountHero().find(".detail-hero__back").exists()).toBe(false);

    const wrapper = mountHero({ backLabel: "返回搜索" });
    await wrapper.get(".detail-hero__back").trigger("click");

    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  // 类型小字是纯装饰还是真信息，取决于标题本身说不说得清；这里只钉住
  // 它不参与操作区，不会被误当成可点元素。
  it("操作区里只有播放、随机与调用方塞进来的额外按钮", () => {
    const wrapper = mount(DetailHero, {
      props: {
        coverUrl: "",
        title: "T",
        playLabel: "播放全部",
        shuffleLabel: "随机播放",
      },
      slots: { actions: '<button class="extra">收藏</button>' },
    });

    const buttons = wrapper.get(".detail-hero__actions").findAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[2].classes()).toContain("extra");
  });
});

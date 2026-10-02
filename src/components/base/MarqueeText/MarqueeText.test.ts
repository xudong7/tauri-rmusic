import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import MarqueeText from "./MarqueeText.vue";

function defineMetrics(
  element: Element,
  metrics: { clientWidth?: number; scrollWidth?: number }
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { value, configurable: true });
  }
}

describe("MarqueeText", () => {
  it("不溢出时不渐隐、不滚动", async () => {
    const wrapper = mount(MarqueeText, { props: { text: "short" } });
    defineMetrics(wrapper.element, { clientWidth: 100 });
    defineMetrics(wrapper.find(".marquee__inner").element, { scrollWidth: 80 });
    (wrapper.vm as unknown as { measure: () => void }).measure();
    await nextTick();

    expect(wrapper.classes()).not.toContain("is-overflowing");
    await wrapper.trigger("mouseenter");
    expect(wrapper.find(".marquee__inner").classes()).not.toContain("is-animating");
  });

  it("溢出时右侧渐隐，悬停后按溢出距离往返滚动", async () => {
    const wrapper = mount(MarqueeText, { props: { text: "a very long song title" } });
    defineMetrics(wrapper.element, { clientWidth: 50 });
    defineMetrics(wrapper.find(".marquee__inner").element, { scrollWidth: 150 });
    (wrapper.vm as unknown as { measure: () => void }).measure();
    await nextTick();

    expect(wrapper.classes()).toContain("is-overflowing");
    expect(wrapper.classes()).not.toContain("is-scrolling");

    await wrapper.trigger("mouseenter");
    const inner = wrapper.find(".marquee__inner");
    expect(inner.classes()).toContain("is-animating");
    expect(inner.attributes("style")).toContain("--marquee-shift: -100px");

    await wrapper.trigger("mouseleave");
    expect(wrapper.find(".marquee__inner").classes()).not.toContain("is-animating");
  });
});

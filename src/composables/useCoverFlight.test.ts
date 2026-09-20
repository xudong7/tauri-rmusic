import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCoverFlightSource,
  playCoverFlight,
  registerCoverFlightSource,
} from "./useCoverFlight";

/** jsdom 没有 WAAPI，用即时完成的桩，顺便抓住被动画的那个元素 */
let animatedEl: HTMLElement | null = null;
let animateCalls: Keyframe[][] = [];

function stubAnimate() {
  animatedEl = null;
  animateCalls = [];
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[]) {
    animatedEl = this as HTMLElement;
    animateCalls.push(keyframes);
    return { finished: Promise.resolve() } as unknown as Animation;
  } as typeof Element.prototype.animate;
}

function stubRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number }
) {
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }) as DOMRect;
}

function makeCover(rect: Parameters<typeof stubRect>[1], withImage = true) {
  const el = document.createElement("div");
  stubRect(el, rect);
  if (withImage) {
    const img = document.createElement("img");
    img.src = "/cover.png";
    el.appendChild(img);
  }
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  stubAnimate();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("playCoverFlight", () => {
  it("把副本摆到终点矩形，再从起点矩形飞过去", async () => {
    const from = makeCover({ left: 24, top: 700, width: 48, height: 48 });
    const to = makeCover({ left: 200, top: 120, width: 320, height: 320 });

    const flew = await playCoverFlight(from, to, { phase: "enter", hideTarget: true });

    expect(flew).toBe(true);
    expect(animatedEl?.classList.contains("cover-flight")).toBe(true);
    // 副本按终点矩形定位，靠 transform 回到起点（transform-origin: 0 0）
    expect(animatedEl?.style.left).toBe("200px");
    expect(animatedEl?.style.width).toBe("320px");
    expect(animatedEl?.style.transform).toBe("translate(-176px, 580px) scale(0.15)");
    expect(animateCalls[0][1]).toEqual({ transform: "translate(0px, 0px) scale(1)" });
    // 落位后副本清掉，两端封面恢复
    expect(document.querySelector(".cover-flight")).toBeNull();
    expect(from.style.visibility).toBe("");
    expect(to.style.visibility).toBe("");
  });

  it("飞行期间藏起两端封面，避免与副本重影", async () => {
    const from = makeCover({ left: 24, top: 700, width: 48, height: 48 });
    const to = makeCover({ left: 200, top: 120, width: 320, height: 320 });
    let seenFrom = "";
    let seenTo = "";
    Element.prototype.animate = function (this: Element) {
      seenFrom = from.style.visibility;
      seenTo = to.style.visibility;
      return { finished: Promise.resolve() } as unknown as Animation;
    } as typeof Element.prototype.animate;

    await playCoverFlight(from, to, { phase: "enter", hideTarget: true });

    expect(seenFrom).toBe("hidden");
    expect(seenTo).toBe("hidden");
  });

  it("退场时终点（播放栏封面）不藏，避免播放栏空一块", async () => {
    const from = makeCover({ left: 200, top: 120, width: 320, height: 320 });
    const to = makeCover({ left: 24, top: 700, width: 48, height: 48 });
    let seenTo = "";
    Element.prototype.animate = function (this: Element) {
      seenTo = to.style.visibility;
      return { finished: Promise.resolve() } as unknown as Animation;
    } as typeof Element.prototype.animate;

    await playCoverFlight(from, to, { phase: "leave", hideTarget: false });

    expect(seenTo).toBe("");
  });

  it("缺少任一端、尺寸为零或拿不到封面图时直接跳过，由淡入淡出兜底", async () => {
    const withImage = makeCover({ left: 24, top: 700, width: 48, height: 48 });
    const bare = makeCover({ left: 200, top: 120, width: 320, height: 320 }, false);
    const bareFrom = makeCover({ left: 24, top: 700, width: 48, height: 48 }, false);
    const collapsed = makeCover({ left: 0, top: 0, width: 0, height: 0 });

    expect(
      await playCoverFlight(null, withImage, { phase: "enter", hideTarget: true })
    ).toBe(false);
    // 两端都没有封面图（占位封面）
    expect(
      await playCoverFlight(bareFrom, bare, { phase: "enter", hideTarget: true })
    ).toBe(false);
    // 量不到尺寸（还没布局）
    expect(
      await playCoverFlight(collapsed, withImage, { phase: "enter", hideTarget: true })
    ).toBe(false);
    expect(document.querySelector(".cover-flight")).toBeNull();
  });

  it("系统开了减少动态效果时不飞", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }) as MediaQueryList)
    );
    const from = makeCover({ left: 24, top: 700, width: 48, height: 48 });
    const to = makeCover({ left: 200, top: 120, width: 320, height: 320 });

    expect(await playCoverFlight(from, to, { phase: "enter", hideTarget: true })).toBe(
      false
    );
    expect(animatedEl).toBeNull();
  });
});

describe("封面起点登记", () => {
  it("登记后能取回同一个元素，注销后为空", () => {
    const el = document.createElement("div");
    registerCoverFlightSource(el);
    expect(getCoverFlightSource()).toBe(el);
    registerCoverFlightSource(null);
    expect(getCoverFlightSource()).toBeNull();
  });
});

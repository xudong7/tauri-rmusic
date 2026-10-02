import { beforeEach, describe, expect, it } from "vitest";
import {
  clearScrollPositions,
  getScrollPosition,
  saveScrollPosition,
} from "./useScrollMemory";

describe("useScrollMemory", () => {
  beforeEach(() => {
    clearScrollPositions();
  });

  it("保存并读取位置", () => {
    saveScrollPosition("a", 120);
    expect(getScrollPosition("a")).toBe(120);
  });

  it("回到顶部会清掉记录", () => {
    saveScrollPosition("a", 120);
    saveScrollPosition("a", 0);
    expect(getScrollPosition("a")).toBe(0);
  });

  it("空 key 不记录", () => {
    saveScrollPosition("", 100);
    expect(getScrollPosition("")).toBe(0);
  });

  it("不同 key 互不影响", () => {
    saveScrollPosition("a", 10);
    saveScrollPosition("b", 20);
    expect(getScrollPosition("a")).toBe(10);
    expect(getScrollPosition("b")).toBe(20);
  });
});

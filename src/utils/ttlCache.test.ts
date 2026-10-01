import { afterEach, describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttlCache";

describe("createTtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("命中时返回值，过期后视为未命中", () => {
    vi.useFakeTimers();
    const cache = createTtlCache<string>(1000);
    cache.set("k", "v");

    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(1);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("超过上限时淘汰最久未使用的条目", () => {
    const cache = createTtlCache<number>(60_000, 3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // 访问 a 刷新它的位置，b 变成最久未用
    expect(cache.get("a")).toBe(1);
    cache.set("d", 4);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("覆盖同一个键不会占用两份额度", () => {
    const cache = createTtlCache<string>(60_000, 2);
    cache.set("k", "old");
    cache.set("k", "new");
    cache.set("other", "x");

    expect(cache.get("k")).toBe("new");
    expect(cache.size).toBe(2);
  });

  it("delete/clear 立即生效", () => {
    const cache = createTtlCache<string>(60_000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheOnlineCover: vi.fn(),
  loadLocalCoverPath: vi.fn(),
}));

vi.mock("@/api/commands/netease", () => ({
  cacheOnlineCover: (...args: unknown[]) => mocks.cacheOnlineCover(...args),
}));

vi.mock("@/api/commands/file", () => ({
  loadLocalCoverPath: (...args: unknown[]) => mocks.loadLocalCoverPath(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

import { loadOnlineCover } from "./coverUtils";

describe("loadOnlineCover", () => {
  beforeEach(() => {
    mocks.cacheOnlineCover.mockReset();
  });

  it("命中磁盘缓存时返回 asset 地址", async () => {
    mocks.cacheOnlineCover.mockResolvedValue("/cache/a.jpg");
    await expect(loadOnlineCover("https://x/a.jpg?u=1")).resolves.toBe(
      "asset://localhost//cache/a.jpg"
    );
  });

  it("缓存不可用时回退原始 URL", async () => {
    mocks.cacheOnlineCover.mockResolvedValue(null);
    await expect(loadOnlineCover("https://x/b.jpg")).resolves.toBe("https://x/b.jpg");
  });

  it("命令抛错时也回退原始 URL，不把错误抛给调用方", async () => {
    mocks.cacheOnlineCover.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadOnlineCover("https://x/c.jpg")).resolves.toBe("https://x/c.jpg");
    errorSpy.mockRestore();
  });

  it("同一 URL 只经 IPC 一次", async () => {
    mocks.cacheOnlineCover.mockResolvedValue("/cache/d.jpg");
    await loadOnlineCover("https://x/d.jpg");
    await loadOnlineCover("https://x/d.jpg");
    expect(mocks.cacheOnlineCover).toHaveBeenCalledTimes(1);
  });

  it("空 URL 直接返回空串", async () => {
    await expect(loadOnlineCover("")).resolves.toBe("");
    expect(mocks.cacheOnlineCover).not.toHaveBeenCalled();
  });
});

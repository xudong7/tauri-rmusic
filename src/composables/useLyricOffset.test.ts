import { beforeEach, describe, expect, it } from "vitest";
import { LYRICS_OFFSET_MAX_MS, STORAGE_KEY_LYRIC_OFFSET } from "@/constants";
import { useLyricOffset } from "./useLyricOffset";

describe("useLyricOffset", () => {
  beforeEach(() => {
    useLyricOffset().resetOffset();
  });

  it("默认 0，按步长调整并写入 localStorage", () => {
    const { offsetMs, adjustOffset } = useLyricOffset();
    expect(offsetMs.value).toBe(0);

    adjustOffset();
    expect(offsetMs.value).toBe(500);
    expect(localStorage.getItem(STORAGE_KEY_LYRIC_OFFSET)).toBe("500");

    adjustOffset(-1000);
    expect(offsetMs.value).toBe(-500);
  });

  it("不会超过上下限", () => {
    const { offsetMs, adjustOffset } = useLyricOffset();
    adjustOffset(100_000);
    expect(offsetMs.value).toBe(LYRICS_OFFSET_MAX_MS);
    adjustOffset(-1_000_000);
    expect(offsetMs.value).toBe(-LYRICS_OFFSET_MAX_MS);
  });
});

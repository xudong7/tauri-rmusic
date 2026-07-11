import { describe, expect, it } from "vitest";
import { findLyricIndex, parseLyric } from "./useLyrics";

describe("useLyrics", () => {
  it("parses multiple timestamps and sorts lyric lines", () => {
    const lines = parseLyric("[00:02.50]Second\n[00:01.000][00:03.000]Shared");
    expect(lines).toEqual([
      { time: 1000, text: "Shared" },
      { time: 2500, text: "Second" },
      { time: 3000, text: "Shared" },
    ]);
  });

  it("finds the active line with binary search", () => {
    const lines = [
      { time: 1000, text: "A" },
      { time: 2000, text: "B" },
      { time: 3000, text: "C" },
    ];
    expect(findLyricIndex(lines, 2500)).toBe(1);
    expect(findLyricIndex(lines, 4000)).toBe(2);
    expect(findLyricIndex([], 1000)).toBe(-1);
  });
});

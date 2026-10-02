import { describe, expect, it } from "vitest";
import { findLyricIndex, parseLyric, parseLyricWithTranslation } from "./lyrics";

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

describe("parseLyricWithTranslation", () => {
  it("按时间戳把翻译合并到对应行", () => {
    const lines = parseLyricWithTranslation(
      "[00:01.00]Hello\n[00:02.00]World",
      "[00:01.00]你好\n[00:02.00]世界"
    );
    expect(lines).toEqual([
      { time: 1000, text: "Hello", translation: "你好" },
      { time: 2000, text: "World", translation: "世界" },
    ]);
  });

  it("无翻译或时间戳对不上的行保持原样", () => {
    expect(parseLyricWithTranslation("[00:01.00]Hello", "")).toEqual([
      { time: 1000, text: "Hello" },
    ]);
    expect(parseLyricWithTranslation("[00:01.00]Hello", "[00:09.00]不对应")).toEqual([
      { time: 1000, text: "Hello" },
    ]);
  });
});

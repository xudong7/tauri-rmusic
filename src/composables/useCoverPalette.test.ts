import { describe, expect, it } from "vitest";
import { getAdjustedBrightness } from "./useCoverPalette";

// 组件用 `brightness <= 0.98` 判断是否切深色前景（uses-dark-foreground），
// 所以 0.96 这一档等价于「亮背景 + 深色前景」。
function usesDarkForeground(averageBrightness: number): boolean {
  return getAdjustedBrightness(averageBrightness) <= 0.98;
}

describe("getAdjustedBrightness", () => {
  it("brightens dark covers and keeps white foreground", () => {
    expect(getAdjustedBrightness(0.15)).toBe(1.28);
    expect(getAdjustedBrightness(0.29)).toBe(1.28);
    expect(usesDarkForeground(0.15)).toBe(false);
  });

  it("keeps white foreground for covers below the light cutoff", () => {
    expect(getAdjustedBrightness(0.3)).toBe(1.1);
    expect(getAdjustedBrightness(0.49)).toBe(1.1);
    expect(usesDarkForeground(0.49)).toBe(false);
  });

  // 0.5 以上经背景模糊和提亮后已经是浅色底，白字会糊在一起
  it("switches to dark foreground once the cover is light enough", () => {
    expect(getAdjustedBrightness(0.5)).toBe(0.96);
    expect(getAdjustedBrightness(0.5224)).toBe(0.96);
    expect(getAdjustedBrightness(0.9)).toBe(0.96);
    expect(usesDarkForeground(0.5224)).toBe(true);
  });
});

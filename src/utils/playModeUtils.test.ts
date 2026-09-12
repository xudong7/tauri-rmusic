import { Refresh, RefreshRight, Sort } from "@element-plus/icons-vue";
import { describe, expect, it } from "vitest";
import { PlayMode } from "@/types/model";
import { PLAY_MODE_SEQUENCE, playModeIcon, playModeLabelKey } from "./playModeUtils";

describe("playModeUtils", () => {
  it("maps each mode to a distinct icon", () => {
    expect(playModeIcon(PlayMode.SEQUENTIAL)).toBe(Sort);
    expect(playModeIcon(PlayMode.RANDOM)).toBe(Refresh);
    expect(playModeIcon(PlayMode.REPEAT_ONE)).toBe(RefreshRight);
  });

  it("maps each mode to a label key", () => {
    expect(playModeLabelKey(PlayMode.SEQUENTIAL)).toBe("playerBar.sequential");
    expect(playModeLabelKey(PlayMode.RANDOM)).toBe("playerBar.random");
    expect(playModeLabelKey(PlayMode.REPEAT_ONE)).toBe("playerBar.repeatOne");
  });

  it("falls back to sequential for an undefined mode", () => {
    expect(playModeIcon(undefined)).toBe(Sort);
    expect(playModeLabelKey(undefined)).toBe("playerBar.sequential");
  });

  // 切换顺序由这个数组决定，播放栏与沉浸页共用
  it("cycles through every mode exactly once", () => {
    expect(new Set(PLAY_MODE_SEQUENCE).size).toBe(PLAY_MODE_SEQUENCE.length);
    for (const mode of Object.values(PlayMode)) {
      expect(PLAY_MODE_SEQUENCE).toContain(mode);
    }
  });
});

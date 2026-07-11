import { describe, expect, it } from "vitest";
import { PlayMode } from "@/types/model";
import { getPlaybackStep, getSequentialIndex, normalizeIndex } from "./playbackQueue";

describe("playbackQueue", () => {
  it("wraps sequential indexes in both directions", () => {
    expect(normalizeIndex(-1, 4)).toBe(3);
    expect(getSequentialIndex(3, 1, 4)).toBe(0);
    expect(getSequentialIndex(0, -1, 4)).toBe(3);
  });

  it("uses one-step navigation outside random mode", () => {
    expect(
      getPlaybackStep({ playMode: PlayMode.SEQUENTIAL, length: 5, direction: 3 })
    ).toBe(1);
    expect(
      getPlaybackStep({ playMode: PlayMode.REPEAT_ONE, length: 5, direction: -3 })
    ).toBe(-1);
  });

  it("never returns the current item in random mode", () => {
    expect(
      getPlaybackStep({
        playMode: PlayMode.RANDOM,
        length: 5,
        direction: 1,
        random: () => 0,
      })
    ).toBe(1);
    expect(
      getPlaybackStep({
        playMode: PlayMode.RANDOM,
        length: 5,
        direction: -1,
        random: () => 0.999,
      })
    ).toBe(-4);
  });
});

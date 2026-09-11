import { describe, expect, it, vi } from "vitest";
import { PlayMode } from "@/types/model";
import {
  getPlaybackStep,
  getSequentialIndex,
  normalizeIndex,
  playFromQueueWithSkip,
  MAX_CONSECUTIVE_SKIPS,
  type PlaybackAttempt,
} from "./playbackQueue";

/** 用一组「第几首放不出来」构造 playAt，并记录调用顺序。 */
function makePlayAt(unplayable: Set<number>) {
  const calls: number[] = [];
  const playAt = async (index: number): Promise<PlaybackAttempt> => {
    calls.push(index);
    return unplayable.has(index) ? "failed" : "played";
  };
  return { playAt, calls };
}

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

describe("playFromQueueWithSkip", () => {
  it("plays the target immediately when it is available", async () => {
    const { playAt, calls } = makePlayAt(new Set());
    const result = await playFromQueueWithSkip(5, 2, 1, playAt);
    expect(result).toEqual({ played: true, skipped: 0, superseded: false });
    expect(calls).toEqual([2]);
  });

  // 匿名访问下 VIP / 下架曲目占比不低：遇到一首放不出来就停住整个歌单，
  // 是最糟的行为。应当继续往后找。
  it("skips unplayable tracks and keeps going", async () => {
    const { playAt, calls } = makePlayAt(new Set([2, 3, 4]));
    const result = await playFromQueueWithSkip(10, 2, 1, playAt);
    expect(result.played).toBe(true);
    expect(result.skipped).toBe(3);
    expect(calls).toEqual([2, 3, 4, 5]);
  });

  it("walks backwards when the step is negative", async () => {
    const { playAt, calls } = makePlayAt(new Set([3, 2]));
    const result = await playFromQueueWithSkip(10, 3, -1, playAt);
    expect(result.played).toBe(true);
    expect(calls).toEqual([3, 2, 1]);
  });

  it("wraps around the end of the queue", async () => {
    const { playAt, calls } = makePlayAt(new Set([7, 8]));
    const result = await playFromQueueWithSkip(9, 7, 1, playAt);
    expect(result.played).toBe(true);
    expect(calls).toEqual([7, 8, 0]);
  });

  it("gives up after the skip budget instead of scanning forever", async () => {
    const unplayable = new Set(Array.from({ length: 50 }, (_, i) => i));
    const { playAt, calls } = makePlayAt(unplayable);
    const result = await playFromQueueWithSkip(50, 0, 1, playAt);
    expect(result).toEqual({
      played: false,
      skipped: MAX_CONSECUTIVE_SKIPS + 1,
      superseded: false,
    });
    expect(calls).toHaveLength(MAX_CONSECUTIVE_SKIPS + 1);
  });

  // 队列只有一首时，按 step 前进会绕回同一首。没有 attempted 守卫的话
  // 这里会一直重试到跳过预算耗尽，白白弹 5 次错误。
  it("does not retry the same index when the queue has one item", async () => {
    const { playAt, calls } = makePlayAt(new Set([0]));
    const result = await playFromQueueWithSkip(1, 0, 1, playAt);
    expect(result.played).toBe(false);
    expect(calls).toEqual([0]);
  });

  // 有更新的播放请求接管时，自动续播必须立刻停手，否则会和用户
  // 刚点的操作抢播放器。
  it("stops immediately when the attempt is superseded", async () => {
    const playAt = vi.fn(async (): Promise<PlaybackAttempt> => "superseded");
    const result = await playFromQueueWithSkip(10, 0, 1, playAt);
    expect(result).toEqual({ played: false, skipped: 0, superseded: true });
    expect(playAt).toHaveBeenCalledTimes(1);
  });
});

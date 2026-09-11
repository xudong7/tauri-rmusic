import { describe, expect, it } from "vitest";
import {
  alignShuffleCursor,
  stepShuffle,
  MAX_SHUFFLE_HISTORY_SIZE,
} from "./shuffleHistory";

const keys = (...items: string[]) => new Set(items);
/** 固定取值，让「随机」在测试里可预测 */
const alwaysFirst = () => 0;

describe("alignShuffleCursor", () => {
  it("resets to just the current track when the context changes", () => {
    const next = alignShuffleCursor({ history: ["a", "b", "c"], cursor: 2 }, true, "x");
    expect(next).toEqual({ history: ["x"], cursor: 0 });
  });

  it("starts empty when the context changes with nothing playing", () => {
    expect(alignShuffleCursor({ history: ["a"], cursor: 0 }, true, null)).toEqual({
      history: [],
      cursor: -1,
    });
  });

  it("leaves the state alone when the cursor already points at the current track", () => {
    const state = { history: ["a", "b", "c"], cursor: 1 };
    expect(alignShuffleCursor(state, false, "b")).toBe(state);
  });

  it("walks the cursor back to a track that is already in history", () => {
    const next = alignShuffleCursor({ history: ["a", "b", "c"], cursor: 2 }, false, "a");
    expect(next).toEqual({ history: ["a", "b", "c"], cursor: 0 });
  });

  it("resets when the current track is not in history at all", () => {
    // 例如用户直接点了列表里的一行，这首不是通过随机播放到达的
    const next = alignShuffleCursor({ history: ["a", "b"], cursor: 1 }, false, "z");
    expect(next).toEqual({ history: ["z"], cursor: 0 });
  });
});

describe("stepShuffle", () => {
  it("picks an unvisited track when moving forward past the end", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a"],
      cursor: 0,
      currentKey: "a",
      availableKeys: keys("a", "b", "c"),
      random: alwaysFirst,
    });
    expect(result.key).toBe("b");
    expect(result.history).toEqual(["a", "b"]);
    expect(result.cursor).toBe(1);
  });

  it("never picks the current track when unvisited options exist", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b"],
      cursor: 1,
      currentKey: "b",
      availableKeys: keys("a", "b"),
      random: alwaysFirst,
    });
    // a 已访问、b 是当前曲目 —— 只能退化为「除当前之外任意」
    expect(result.key).toBe("a");
  });

  it("returns null when the queue holds nothing but the current track", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a"],
      cursor: 0,
      currentKey: "a",
      availableKeys: keys("a"),
    });
    expect(result.key).toBeNull();
  });

  it("walks forward through existing history instead of picking a new track", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b", "c"],
      cursor: 0,
      currentKey: "a",
      availableKeys: keys("a", "b", "c"),
      random: alwaysFirst,
    });
    expect(result.key).toBe("b");
    expect(result.cursor).toBe(1);
  });

  it("walks backward through history for previous", () => {
    const result = stepShuffle({
      direction: -1,
      history: ["a", "b", "c"],
      cursor: 2,
      currentKey: "c",
      availableKeys: keys("a", "b", "c"),
    });
    expect(result.key).toBe("b");
    expect(result.cursor).toBe(1);
  });

  // 回归：原实现边走边改游标，走到底后既没播歌、又把游标钉死在边界，
  // 导致后续所有按键失效。
  it("keeps the cursor intact when previous finds nothing", () => {
    const result = stepShuffle({
      direction: -1,
      history: ["a", "b"],
      cursor: 1,
      currentKey: "b",
      // a 已被移出队列 —— history 全部失效
      availableKeys: keys("b"),
    });

    expect(result.key).toBeNull();
    // 游标必须原地不动，而不是被推到 0
    expect(result.cursor).toBe(1);
  });

  it("still lets you go forward after a failed previous", () => {
    // 上面那条的直接后果：游标没被钉死，所以「下一首」仍能走到随机分支
    const failedPrev = stepShuffle({
      direction: -1,
      history: ["a", "b"],
      cursor: 1,
      currentKey: "b",
      availableKeys: keys("b", "c"),
    });
    expect(failedPrev.cursor).toBe(1);

    const next = stepShuffle({
      direction: 1,
      history: failedPrev.history,
      cursor: failedPrev.cursor,
      currentKey: "b",
      availableKeys: keys("b", "c"),
      random: alwaysFirst,
    });
    expect(next.key).toBe("c");
    expect(next.cursor).toBe(2);
  });

  it("picks a new track when the forward history is entirely stale", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b", "c"],
      cursor: 0,
      currentKey: "a",
      // b、c 都已不在队列里
      availableKeys: keys("a", "d"),
      random: alwaysFirst,
    });
    expect(result.key).toBe("d");
    // 新分支：c 这段旧的前进记录被截断
    expect(result.history).toEqual(["a", "d"]);
  });

  it("truncates the forward branch when starting a new one", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b", "c", "d"],
      cursor: 1,
      currentKey: "b",
      availableKeys: keys("a", "b", "z"),
      random: alwaysFirst,
    });
    expect(result.history).toEqual(["a", "b", "z"]);
    expect(result.cursor).toBe(2);
  });

  it("caps the history length", () => {
    const history = Array.from({ length: MAX_SHUFFLE_HISTORY_SIZE }, (_, i) => `k${i}`);
    const available = new Set([...history, "fresh"]);
    const result = stepShuffle({
      direction: 1,
      history,
      cursor: history.length - 1,
      currentKey: `k${history.length - 1}`,
      availableKeys: available,
      random: alwaysFirst,
      maxHistory: 5,
    });
    expect(result.history).toHaveLength(5);
    expect(result.history[result.history.length - 1]).toBe(result.key);
  });

  it("skips stale entries while walking backward", () => {
    const result = stepShuffle({
      direction: -1,
      history: ["a", "b", "c"],
      cursor: 2,
      currentKey: "c",
      // b 已不在队列，但 a 还在
      availableKeys: keys("a", "c"),
    });
    expect(result.key).toBe("a");
    expect(result.cursor).toBe(0);
  });
});

describe("stepShuffle excludedKeys", () => {
  // 跳过不可播曲目时的关键场景：history 已覆盖整个队列（听了一轮之后的
  // 常态），前进分支因此落到「除当前曲目外全都可以」的兜底候选集。
  // 这个集合里包含刚试过并失败的那些，没有 excludedKeys 就会原样返回 a，
  // 调用方于是在坏曲目上反复重抽，明明还有 c 能放却报「没有可播放的歌曲」。
  it("does not re-pick a failed key from the fallback candidate pool", () => {
    const input = {
      direction: 1,
      history: ["a", "b", "c", "d"],
      cursor: 3,
      currentKey: "d",
      availableKeys: keys("a", "b", "c", "d"),
      random: alwaysFirst,
    };

    // 未排除时按 alwaysFirst 会挑中 a —— 正是刚失败的那一首
    const withoutExclusion = stepShuffle(input);
    expect(withoutExclusion.key).toBe("a");

    // 排除 a、b 之后应当落到 c
    const result = stepShuffle({ ...input, excludedKeys: keys("a", "b") });
    expect(result.key).toBe("c");
  });

  it("returns null rather than a tried key when nothing else is left", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b"],
      cursor: 1,
      currentKey: "b",
      availableKeys: keys("a", "b"),
      excludedKeys: keys("a", "b"),
    });
    expect(result.key).toBeNull();
  });

  it("also excludes tried keys when walking backward", () => {
    const result = stepShuffle({
      direction: -1,
      history: ["a", "b", "c"],
      cursor: 2,
      currentKey: "c",
      availableKeys: keys("a", "b", "c"),
      excludedKeys: keys("b"),
    });
    expect(result.key).toBe("a");
  });

  it("still prefers unvisited keys over the fallback pool", () => {
    const result = stepShuffle({
      direction: 1,
      history: ["a", "b"],
      cursor: 1,
      currentKey: "b",
      availableKeys: keys("a", "b", "c", "d"),
      excludedKeys: keys("c"),
      random: alwaysFirst,
    });
    // c 被排除，未听过的只剩 d，应选中 d 而不是回落到 a
    expect(result.key).toBe("d");
  });
});

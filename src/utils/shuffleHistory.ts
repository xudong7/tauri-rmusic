/**
 * 随机播放的历史游标。
 *
 * 从 playerStore 中抽出：这是该 store 里唯一带算法的部分，原先与播放副作用
 * 耦合在一起，无法单测。抽出后只做「下一个该放哪首」的决策，
 * 由调用方负责真正播放。
 *
 * 语义与浏览器历史一致：
 * - 「上一首」沿 history 往回走，不产生新记录
 * - 「下一首」优先走已回退过的记录；走到头才随机挑一首没听过的，
 *   并把游标之后的分支截断（因为从这点起走向了新分支）
 */

export const MAX_SHUFFLE_HISTORY_SIZE = 200;

export interface ShuffleState {
  history: string[];
  cursor: number;
}

/**
 * 把游标对齐到当前正在播放的曲目。
 *
 * 上下文（歌单 / 本地目录 / 在线队列）变化时重置为只含当前曲目；
 * 否则把游标移到当前曲目在 history 中的位置；找不到说明这首不是通过
 * 随机播放到达的（例如用户直接点了某一行），此时同样重置。
 */
export function alignShuffleCursor(
  state: ShuffleState,
  contextChanged: boolean,
  currentKey: string | null
): ShuffleState {
  if (contextChanged) {
    const history = currentKey ? [currentKey] : [];
    return { history, cursor: history.length - 1 };
  }

  if (!currentKey || state.history[state.cursor] === currentKey) return state;

  const previousIndex = state.history.lastIndexOf(currentKey);
  if (previousIndex >= 0) {
    return { history: state.history, cursor: previousIndex };
  }
  return { history: [currentKey], cursor: 0 };
}

export interface ShuffleStepInput {
  /** -1 表示上一首，其余表示下一首 */
  direction: number;
  history: string[];
  cursor: number;
  currentKey: string | null;
  /** 当前队列里仍然可用的曲目 key（可能在播放过程中被移除） */
  availableKeys: ReadonlySet<string>;
  /**
   * 本次「下一首/上一首」中已经试过、不该再选的 key。
   *
   * 跳过不可播曲目时必须传入：仅靠「选中的 key 会被记进 history」不足以
   * 避重，因为 history 覆盖整个队列后，前进分支会退回
   * 「除当前曲目外全都可以」的兜底候选集，那个集合里包含刚失败的那些，
   * 于是可能在坏曲目上反复重抽——明明还有能放的歌却报「没有可播放的歌曲」。
   */
  excludedKeys?: ReadonlySet<string>;
  maxHistory?: number;
  /** 便于测试注入 */
  random?: () => number;
}

export interface ShuffleStepResult {
  /**
   * 要播放的 key。
   * null 表示本次不做任何改变 —— 调用方应当静默返回，且 state 未被改动。
   */
  key: string | null;
  history: string[];
  cursor: number;
}

/**
 * 计算随机模式下「下一首 / 上一首」的目标。
 *
 * 关键点：只有在**确实找到目标**时才推进游标。原实现边走边改游标，
 * 一旦走到头就既没播歌、又把游标钉死在边界上，导致后续按键全部失效。
 */
export function stepShuffle(input: ShuffleStepInput): ShuffleStepResult {
  const { direction, currentKey, availableKeys } = input;
  const maxHistory = input.maxHistory ?? MAX_SHUFFLE_HISTORY_SIZE;
  const random = input.random ?? Math.random;
  const excluded = input.excludedKeys;
  const selectable = (key: string) =>
    availableKeys.has(key) && !(excluded?.has(key) ?? false);

  if (direction < 0) {
    // 回退：沿 history 往回找第一个仍在队列里、且本次还没试过的条目。
    // 找不到时保持原状（history 已全部失效），游标不动 —— 这很重要，
    // 否则用户会被卡在边界上，之后连「下一首」都会走错分支。
    for (let index = input.cursor - 1; index >= 0; index--) {
      if (selectable(input.history[index])) {
        return { key: input.history[index], history: input.history, cursor: index };
      }
    }
    return { key: null, history: input.history, cursor: input.cursor };
  }

  // 前进：先看是否曾回退过、后面还有记录。
  for (let index = input.cursor + 1; index < input.history.length; index++) {
    if (selectable(input.history[index])) {
      return { key: input.history[index], history: input.history, cursor: index };
    }
  }

  // 已无可用前进记录，进入新领域：优先挑没听过的，都听过则退化为随机。
  const visited = new Set(input.history);
  const pool = [...availableKeys].filter((key) => !(excluded?.has(key) ?? false));
  const unvisited = pool.filter((key) => key !== currentKey && !visited.has(key));
  const candidates =
    unvisited.length > 0 ? unvisited : pool.filter((key) => key !== currentKey);
  if (candidates.length === 0) {
    return { key: null, history: input.history, cursor: input.cursor };
  }

  const key = candidates[Math.floor(random() * candidates.length)];

  // 从当前位置开出新分支：丢弃其后的旧前进记录
  let history = input.history.slice(0, input.cursor + 1);
  history.push(key);
  if (history.length > maxHistory) history = history.slice(history.length - maxHistory);

  return { key, history, cursor: history.length - 1 };
}

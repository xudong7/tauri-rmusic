import { PlayMode } from "@/types/model";

export function normalizeIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return ((index % length) + length) % length;
}

export function getSequentialIndex(
  currentIndex: number,
  step: number,
  length: number
): number {
  return normalizeIndex(currentIndex + step, length);
}

export function getPlaybackStep(options: {
  playMode: PlayMode;
  length: number;
  direction: number;
  random?: () => number;
}): number {
  const { playMode, length, direction, random = Math.random } = options;
  const sign = direction < 0 ? -1 : 1;
  if (playMode !== PlayMode.RANDOM || length <= 1) return sign;

  const offset = Math.floor(random() * (length - 1)) + 1;
  return sign * offset;
}

/**
 * 一次播放尝试的结果。
 *
 * superseded 与 failed 必须分开：「已作废」说明有更新的播放请求接管了，
 * 自动续播要立刻停手，否则会和用户刚点的操作抢播放器；failed 才是
 * 「这首放不出来」，可以继续往后找。
 */
export type PlaybackAttempt = "played" | "failed" | "superseded";

/**
 * 自动续播时连续跳过多少首不可播曲目就放弃。
 *
 * 匿名访问下 VIP / 下架曲目占比不低，遇到一首就停住整个歌单是最糟的行为；
 * 但整张歌单都不可播时也不能无限转下去。
 */
export const MAX_CONSECUTIVE_SKIPS = 5;

export interface SkipResult {
  played: boolean;
  /** 本次共跳过多少首不可播曲目 */
  skipped: number;
  /** 中途被更新的播放请求取代，调用方不应再报任何错误 */
  superseded: boolean;
}

/**
 * 从 startIndex 起按 step 方向逐首尝试，跳过放不出来的曲目。
 *
 * 只有「下一首 / 上一首」和播放结束后的自动续播走这里。用户在列表里明确点
 * 某一首时不经过它——那是明确意图，失败了应当如实报错而不是偷偷换一首。
 */
export async function playFromQueueWithSkip(
  length: number,
  startIndex: number,
  step: number,
  playAt: (index: number) => Promise<PlaybackAttempt>
): Promise<SkipResult> {
  let index = startIndex;
  let skipped = 0;
  const attempted = new Set<number>();

  // attempted 是防死循环的：队列只有一首、或连续跳过绕回起点时，
  // 只靠 MAX_CONSECUTIVE_SKIPS 会反复重试同一首。
  while (!attempted.has(index)) {
    attempted.add(index);
    const result = await playAt(index);
    if (result === "played") return { played: true, skipped, superseded: false };
    if (result === "superseded") return { played: false, skipped, superseded: true };
    skipped += 1;
    if (skipped > MAX_CONSECUTIVE_SKIPS) break;
    index = getSequentialIndex(index, step, length);
  }
  return { played: false, skipped, superseded: false };
}

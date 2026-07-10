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

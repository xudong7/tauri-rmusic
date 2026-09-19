import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackClock } from "./usePlaybackClock";

function backendState(positionMs = 0) {
  return {
    position_ms: positionMs,
    duration_ms: 120000,
    is_ended: false,
    is_paused: false,
    has_track: true,
    track_id: 1,
  };
}

describe("usePlaybackClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("播放中每 250ms 推进一次位置", async () => {
    let position = 0;
    const clock = usePlaybackClock({
      getBackendState: vi.fn().mockResolvedValue(backendState(0)),
      getCurrentPosition: () => position,
      getIsPlaying: () => true,
      getHasTrack: () => true,
      getIsLoading: () => false,
      setPosition: (ms) => {
        position = ms;
      },
      setDuration: vi.fn(),
      onEnded: vi.fn().mockResolvedValue(undefined),
    });

    clock.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(position).toBeGreaterThanOrEqual(900);
    expect(position).toBeLessThanOrEqual(1100);
    clock.stop();
  });

  it("暂停时不推进位置", async () => {
    let position = 5000;
    const clock = usePlaybackClock({
      getBackendState: vi.fn().mockResolvedValue(backendState(5000)),
      getCurrentPosition: () => position,
      getIsPlaying: () => false,
      getHasTrack: () => true,
      getIsLoading: () => false,
      setPosition: (ms) => {
        position = ms;
      },
      setDuration: vi.fn(),
      onEnded: vi.fn().mockResolvedValue(undefined),
    });

    clock.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(position).toBe(5000);
    clock.stop();
  });
});

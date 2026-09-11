import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useVolumeMute } from "./usePlaybackVolume";

function setup(initial: number) {
  const volume = ref(initial);
  const onChange = vi.fn((next: number) => {
    volume.value = next;
  });
  const mute = useVolumeMute({ currentVolume: () => volume.value, onChange });
  return { volume, onChange, mute };
}

describe("useVolumeMute", () => {
  it("mutes to zero and restores the previous level", () => {
    const { volume, mute } = setup(70);
    mute.toggleMute();
    expect(volume.value).toBe(0);
    mute.toggleMute();
    expect(volume.value).toBe(70);
  });

  // 静音期间用户可能拖动音量条，此时不该把「0」记成可恢复的音量
  it("does not remember zero as the restorable level", () => {
    const { volume, mute } = setup(70);
    mute.toggleMute();
    expect(volume.value).toBe(0);
    // 用户静音后把音量条拖到 15，再静音一次后恢复，应回到 15 而不是 70
    volume.value = 15;
    mute.toggleMute();
    expect(volume.value).toBe(0);
    mute.toggleMute();
    expect(volume.value).toBe(15);
  });

  it("starts from a sane level when the initial volume is zero", () => {
    const { volume, mute } = setup(0);
    mute.toggleMute();
    expect(volume.value).toBeGreaterThan(0);
  });

  // 记忆值在点静音的那一刻读取，不依赖 watcher 的刷新时机。
  // 用 watch 跟踪音量时，同一事件循环内改完音量再点静音会读到旧值。
  it("reads the level synchronously when muting", () => {
    const { volume, mute } = setup(70);
    volume.value = 25;
    mute.toggleMute();
    expect(volume.value).toBe(0);
    mute.toggleMute();
    expect(volume.value).toBe(25);
  });
});

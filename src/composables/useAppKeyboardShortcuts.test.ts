import { describe, expect, it, vi } from "vitest";
import { useAppKeyboardShortcuts } from "./useAppKeyboardShortcuts";

function press(key: string, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("useAppKeyboardShortcuts", () => {
  it("? 触发帮助浮层开关", () => {
    const onToggleHelp = vi.fn();
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onToggleHelp,
    });
    instance.start();

    press("?");
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
    instance.stop();
  });

  it("输入框里按 ? 不触发帮助", () => {
    const onToggleHelp = vi.fn();
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onToggleHelp,
    });
    instance.start();

    const input = document.createElement("input");
    document.body.appendChild(input);
    press("?", input);

    expect(onToggleHelp).not.toHaveBeenCalled();
    instance.stop();
    input.remove();
  });
});

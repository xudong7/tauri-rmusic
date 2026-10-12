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

  it("中文输入法的全角「？」与物理键位兜底同样触发", () => {
    const onToggleHelp = vi.fn();
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onToggleHelp,
    });
    instance.start();

    press("？");
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Unidentified",
        code: "Slash",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(onToggleHelp).toHaveBeenCalledTimes(2);
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

  it("Esc 交给 onEscape，消费后 preventDefault", () => {
    const onEscape = vi.fn().mockReturnValue(true);
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onEscape,
    });
    instance.start();

    const event = press("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    instance.stop();
  });

  it("Esc 没人消费时不 preventDefault，留给其它监听者", () => {
    const onEscape = vi.fn().mockReturnValue(false);
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onEscape,
    });
    instance.start();

    expect(press("Escape").defaultPrevented).toBe(false);
    instance.stop();
  });

  it("焦点在按钮上时 Esc 依然生效（不受交互元素守卫限制）", () => {
    const onEscape = vi.fn().mockReturnValue(true);
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onEscape,
    });
    instance.start();

    const button = document.createElement("button");
    document.body.appendChild(button);
    press("Escape", button);

    expect(onEscape).toHaveBeenCalledTimes(1);
    instance.stop();
    button.remove();
  });

  it("已被消费的 Esc（defaultPrevented）不再触发", () => {
    const onEscape = vi.fn().mockReturnValue(true);
    const instance = useAppKeyboardShortcuts({
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onEscape,
    });
    instance.start();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.body.dispatchEvent(event);

    expect(onEscape).not.toHaveBeenCalled();
    instance.stop();
  });
});

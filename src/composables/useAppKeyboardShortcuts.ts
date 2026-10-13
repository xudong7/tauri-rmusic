export function useAppKeyboardShortcuts(options: {
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  /** 按 ? 打开快捷键帮助浮层 */
  onToggleHelp?: () => void;
  /**
   * 按 Esc：关掉最上层的界面。返回 true 表示这次按键已被消费
   * （消费了才 preventDefault，让其它 Esc 监听者知道轮不到它们）。
   */
  onEscape?: () => boolean;
}) {
  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "input, textarea, select, button, [contenteditable='true'], [role='slider'], .el-slider"
      )
    );
  }

  function isHelpShortcut(event: KeyboardEvent): boolean {
    // 中文输入法下 Shift+/ 产生全角「？」；部分布局 event.key 不稳定，
    // 再按物理键位兜底（Shift + Slash）
    return (
      event.key === "?" ||
      event.key === "？" ||
      (event.shiftKey && event.code === "Slash")
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }

    // Esc 要排在「交互元素」守卫之前：焦点停在按钮或滑块上时也得能关掉
    // 最上层的界面（沉浸模式里几乎任何控件都可能持有焦点）。
    if (event.key === "Escape") {
      if (options.onEscape?.()) event.preventDefault();
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (options.onToggleHelp && isHelpShortcut(event)) {
      options.onToggleHelp();
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        options.onPrevious();
        event.preventDefault();
        break;
      case " ":
        options.onTogglePlay();
        event.preventDefault();
        break;
      case "ArrowRight":
        options.onNext();
        event.preventDefault();
        break;
    }
  }

  function start() {
    window.addEventListener("keydown", handleKeyDown);
  }

  function stop() {
    window.removeEventListener("keydown", handleKeyDown);
  }

  return { start, stop };
}

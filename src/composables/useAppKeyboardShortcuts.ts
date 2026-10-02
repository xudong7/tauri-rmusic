export function useAppKeyboardShortcuts(options: {
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  /** 按 ? 打开快捷键帮助浮层 */
  onToggleHelp?: () => void;
}) {
  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "input, textarea, select, button, [contenteditable='true'], [role='slider'], .el-slider"
      )
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isInteractiveTarget(event.target)
    ) {
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
      case "?":
        if (!options.onToggleHelp) break;
        options.onToggleHelp();
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

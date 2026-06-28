export function useAppKeyboardShortcuts(options: {
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
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

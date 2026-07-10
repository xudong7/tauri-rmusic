import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useTrayPlaybackEvents(options: {
  onPrevious: () => void;
  onNext: () => void;
  onPlay: () => void;
  onPause: () => void;
  onQuit: () => void;
}) {
  const unlisteners: UnlistenFn[] = [];

  async function start() {
    stop();
    try {
      unlisteners.push(await listen("tray-prev", options.onPrevious));
      unlisteners.push(await listen("tray-next", options.onNext));
      unlisteners.push(await listen("tray-play", options.onPlay));
      unlisteners.push(await listen("tray-pause", options.onPause));
      unlisteners.push(await listen("tray-quit", options.onQuit));
    } catch (error) {
      stop();
      throw error;
    }
  }

  function stop() {
    while (unlisteners.length > 0) {
      unlisteners.pop()?.();
    }
  }

  return { start, stop };
}

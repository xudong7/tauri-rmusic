import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PlaybackEndedPayload {
  position_ms: number;
  duration_ms: number;
  track_id: number;
}

/**
 * 后端播放结束事件的监听。
 *
 * start() 可被重复调用（组件重挂载等），只建立一次监听；stop() 之后
 * 若还有在途的 listen()，结果会被立即注销，不会留下悬挂的回调。
 */
export function createPlaybackEventListener(args: {
  getCurrentTrackId: () => number;
  onProgress: (payload: PlaybackEndedPayload) => void;
  onEnded: (trackId: number) => void;
}) {
  let requested = false;
  let unlisten: UnlistenFn | null = null;
  let startPromise: Promise<void> | null = null;

  async function start(): Promise<void> {
    if (requested) return startPromise ?? Promise.resolve();
    requested = true;
    startPromise = (async () => {
      const off = await listen<PlaybackEndedPayload>("playback-ended", (event) => {
        const payload = event.payload;
        if (payload.track_id !== args.getCurrentTrackId()) return;
        args.onProgress(payload);
        void args.onEnded(payload.track_id);
      });
      if (requested) unlisten = off;
      else off();
    })().finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  function stop() {
    requested = false;
    unlisten?.();
    unlisten = null;
  }

  return { start, stop };
}

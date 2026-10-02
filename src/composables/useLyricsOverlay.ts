import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { setLyricsWindow } from "@/api/commands/system";
import { LYRICS_OVERLAY_CLOSED_EVENT } from "@/composables/useLyricsBroadcast";

/**
 * 桌面歌词悬浮窗的开关状态（模块级单例，主窗口内共享）。
 *
 * 悬浮窗可能被它自己的关闭键关掉，主窗通过 `lyrics-overlay-closed`
 * 事件同步回这里，避免按钮状态与实际窗口不一致。
 */
const isLyricsOverlayOpen = ref(false);
let closedListenerAttached = false;

function attachClosedListener() {
  if (closedListenerAttached) return;
  closedListenerAttached = true;
  void listen(LYRICS_OVERLAY_CLOSED_EVENT, () => {
    isLyricsOverlayOpen.value = false;
  }).catch((error) => {
    // 非 Tauri 环境（单测/浏览器预览）没有事件系统，静默降级
    console.warn("[桌面歌词] 监听关闭事件失败:", error);
  });
}

export function useLyricsOverlay() {
  attachClosedListener();

  async function toggleLyricsOverlay() {
    const next = !isLyricsOverlayOpen.value;
    // 乐观切换：窗口创建/关闭是异步 IPC，按钮状态不该等它
    isLyricsOverlayOpen.value = next;
    try {
      await setLyricsWindow({ open: next });
    } catch (error) {
      isLyricsOverlayOpen.value = !next;
      console.error("切换桌面歌词失败:", error);
    }
  }

  function setLyricsOverlayOpen(open: boolean) {
    isLyricsOverlayOpen.value = open;
  }

  return { isLyricsOverlayOpen, toggleLyricsOverlay, setLyricsOverlayOpen };
}

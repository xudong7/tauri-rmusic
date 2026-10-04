import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setMiniPlayerWindow } from "@/api/commands/system";
import { MINI_PLAYER_CLOSED_EVENT } from "@/composables/useMiniPlayerBridge";

/**
 * 迷你播放器的开关状态（模块级单例，主窗口内共享）。
 *
 * 迷你条可能被它自己的关闭键关掉，主窗通过 `mini-player-closed` 事件同步回
 * 这里，避免切换按钮与实际窗口不一致。
 *
 * 关闭后不自动恢复主窗：迷你条的 ✕ 是「隐藏迷你条」（应用回托盘，与主窗红灯
 * 的行为一致），「切回正常界面」是 □ 的职责（见 useMiniPlayerBridge 的
 * restore-main）。两个界面不允许共存，所以切回主窗的路径都会先关掉迷你窗。
 */
const isMiniPlayerOpen = ref(false);
let closedListenerAttached = false;

function attachClosedListener() {
  if (closedListenerAttached) return;
  closedListenerAttached = true;
  void listen(MINI_PLAYER_CLOSED_EVENT, () => {
    isMiniPlayerOpen.value = false;
  }).catch((error) => {
    // 非 Tauri 环境（单测/浏览器预览）没有事件系统，静默降级
    console.warn("[迷你播放器] 监听关闭事件失败:", error);
  });
}

export function useMiniPlayer() {
  attachClosedListener();

  async function enterMiniPlayer() {
    // 乐观切换：建窗与隐藏主窗都是异步 IPC，按钮状态不该等它们
    isMiniPlayerOpen.value = true;
    try {
      await setMiniPlayerWindow({ open: true });
      await getCurrentWindow().hide();
    } catch (error) {
      isMiniPlayerOpen.value = false;
      console.error("进入迷你模式失败:", error);
    }
  }

  async function exitMiniPlayer() {
    isMiniPlayerOpen.value = false;
    try {
      await setMiniPlayerWindow({ open: false });
    } catch (error) {
      isMiniPlayerOpen.value = true;
      console.error("退出迷你模式失败:", error);
    }
  }

  async function toggleMiniPlayer() {
    if (isMiniPlayerOpen.value) await exitMiniPlayer();
    else await enterMiniPlayer();
  }

  return { isMiniPlayerOpen, enterMiniPlayer, exitMiniPlayer, toggleMiniPlayer };
}

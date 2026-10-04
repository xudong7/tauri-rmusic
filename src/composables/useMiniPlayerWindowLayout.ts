import { ref } from "vue";
import { setMiniPlayerPanel } from "@/api/commands/system";
import { STORAGE_KEY_MINI_PLAYER_PANEL } from "@/constants";
import type { MiniPlayerPanel } from "@/types/model";

/**
 * 读上次展开的面板。
 *
 * 主窗进入迷你模式时也要读它（建窗要按目标尺寸直接建出来），所以导出。
 * 两个窗口同源，localStorage 是共享的。
 */
export function readStoredMiniPlayerPanel(): MiniPlayerPanel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MINI_PLAYER_PANEL);
    if (stored === "cover" || stored === "queue") return stored;
  } catch {
    // 拿不到 localStorage（隐私模式等）时按收起处理
  }
  return "none";
}

/**
 * 迷你条上方面板的展开状态，窗口尺寸交给后端命令（底边锚定，见
 * `mini_player_window::set_mini_player_panel`）。
 *
 * 面板状态要落一份到 localStorage：window-state 插件会记住展开后的窗口尺寸，
 * 重开迷你窗时插件按记录恢复成展开尺寸，而组件若默认收起，就会出现「窗口很高
 * 但内容只有一条迷你条」的错位。两个来源都记住，挂载时再对齐一次。
 */
export function useMiniPlayerWindowLayout() {
  const activePanel = ref<MiniPlayerPanel>(readStoredMiniPlayerPanel());

  async function setPanel(panel: MiniPlayerPanel) {
    if (activePanel.value === panel) return;
    activePanel.value = panel;
    try {
      localStorage.setItem(STORAGE_KEY_MINI_PLAYER_PANEL, panel);
    } catch (error) {
      console.warn("[迷你播放器] 保存面板状态失败:", error);
    }

    try {
      // 立即改尺寸：面板不做淡出，收起时直接由窗口裁掉。先淡出会把卡片底色
      // （浅色主题下是白色）露出来，再叠上窗口收缩，底部会闪一块白。
      await setMiniPlayerPanel({ panel });
    } catch (error) {
      console.error("调整迷你播放器窗口尺寸失败:", error);
    }
  }

  /** 点同一个按钮收起，点另一个按钮切换过去 */
  function togglePanel(panel: Exclude<MiniPlayerPanel, "none">) {
    void setPanel(activePanel.value === panel ? "none" : panel);
  }

  /**
   * 挂载时对齐一次：插件恢复出来的窗口尺寸可能和存储的面板不一致
   * （用户在别处清了 localStorage、或窗口尺寸被别的路径改过）。
   */
  async function syncWindowSize() {
    try {
      await setMiniPlayerPanel({ panel: activePanel.value });
    } catch (error) {
      console.error("同步迷你播放器窗口尺寸失败:", error);
    }
  }

  return { activePanel, setPanel, togglePanel, syncWindowSize };
}

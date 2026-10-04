import { ref } from "vue";
import { setMiniPlayerExpanded } from "@/api/commands/system";
import { STORAGE_KEY_MINI_PLAYER_EXPANDED } from "@/constants";

/** 收起时先让大图淡出，再缩窗；与 MiniPlayer.css 里大图的过渡时长一致 */
const COLLAPSE_ANIMATION_MS = 140;

/**
 * 读上次的封面展开态。
 *
 * 主窗进入迷你模式时也要读它（建窗要按目标尺寸直接建出来），所以导出。
 * 两个窗口同源，localStorage 是共享的。
 */
export function readStoredMiniPlayerExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MINI_PLAYER_EXPANDED) === "true";
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * 封面大图的展开/收起状态，窗口尺寸交给后端命令（底边锚定，见
 * `mini_player_window::set_mini_player_expanded`）。
 *
 * 展开态要落一份到 localStorage：window-state 插件会记住展开后的窗口尺寸，
 * 重开迷你窗时插件按记录恢复成展开尺寸，而组件若默认收起，就会出现「窗口很高
 * 但内容只有一条迷你条」的错位。两个来源都记住，挂载时再对齐一次。
 */
export function useMiniPlayerWindowLayout() {
  const isCoverExpanded = ref(readStoredMiniPlayerExpanded());

  async function setCoverExpanded(expanded: boolean) {
    if (isCoverExpanded.value === expanded) return;
    isCoverExpanded.value = expanded;
    try {
      localStorage.setItem(STORAGE_KEY_MINI_PLAYER_EXPANDED, String(expanded));
    } catch (error) {
      console.warn("[迷你播放器] 保存封面展开态失败:", error);
    }

    try {
      // 收起是反过来的：先等大图淡出，再缩小窗口，否则动画会被裁掉
      if (!expanded) await delay(COLLAPSE_ANIMATION_MS);
      await setMiniPlayerExpanded({ expanded });
    } catch (error) {
      console.error("调整迷你播放器窗口尺寸失败:", error);
    }
  }

  function toggleCoverExpanded() {
    void setCoverExpanded(!isCoverExpanded.value);
  }

  /**
   * 挂载时对齐一次：插件恢复出来的窗口尺寸可能和存储的展开态不一致
   * （用户在别处清了 localStorage、或窗口尺寸被别的路径改过）。
   */
  async function syncWindowSize() {
    try {
      await setMiniPlayerExpanded({ expanded: isCoverExpanded.value });
    } catch (error) {
      console.error("同步迷你播放器窗口尺寸失败:", error);
    }
  }

  return { isCoverExpanded, toggleCoverExpanded, syncWindowSize };
}

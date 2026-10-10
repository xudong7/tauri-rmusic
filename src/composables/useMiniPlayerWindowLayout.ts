import { ref } from "vue";
import { setMiniPlayerLayout } from "@/api/commands/system";
import { STORAGE_KEY_MINI_PLAYER_LAYOUT } from "@/constants";
import type { MiniPlayerLayout, MiniPlayerTopPanel } from "@/types/model";

const CLOSED_LAYOUT: MiniPlayerLayout = { top: "none", queue: false };

function toTopPanel(value: unknown): MiniPlayerTopPanel {
  if (value === "cover" || value === "lyrics") return value;
  return "none";
}

/**
 * 读上次的面板开合。
 *
 * 主窗进入迷你模式时也要读它（建窗要按目标尺寸直接建出来），所以导出。
 * 两个窗口同源，localStorage 是共享的。
 */
export function readStoredMiniPlayerLayout(): MiniPlayerLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MINI_PLAYER_LAYOUT);
    if (!raw) return { ...CLOSED_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<MiniPlayerLayout>;
    return { top: toTopPanel(parsed.top), queue: parsed.queue === true };
  } catch {
    // 拿不到或解析失败（隐私模式、旧格式）时按收起处理
    return { ...CLOSED_LAYOUT };
  }
}

/**
 * 迷你条上下面板的开合状态，窗口尺寸交给后端命令（迷你条锚定，见
 * `mini_player_window::set_mini_player_layout`）。
 *
 * 布局要落一份到 localStorage：window-state 插件会记住展开后的窗口尺寸，
 * 重开迷你窗时插件按记录恢复成展开尺寸，而组件若默认收起，就会出现「窗口很高
 * 但内容只有一条迷你条」的错位。两个来源都记住，挂载时再对齐一次。
 */
export function useMiniPlayerWindowLayout() {
  const layout = ref<MiniPlayerLayout>(readStoredMiniPlayerLayout());

  async function setLayout(next: MiniPlayerLayout) {
    if (next.top === layout.value.top && next.queue === layout.value.queue) {
      return;
    }
    layout.value = next;
    try {
      localStorage.setItem(STORAGE_KEY_MINI_PLAYER_LAYOUT, JSON.stringify(next));
    } catch (error) {
      console.warn("[迷你播放器] 保存面板状态失败:", error);
    }

    try {
      // 立即改尺寸：面板不做淡出，收起时直接由窗口裁掉。先淡出会把卡片底色
      // （浅色主题下是白色）露出来，再叠上窗口收缩，底部会闪一块白。
      await setMiniPlayerLayout({ layout: next });
    } catch (error) {
      console.error("调整迷你播放器窗口尺寸失败:", error);
    }
  }

  /** 上方面板二选一：点同一个按钮收起，点另一个按钮切换过去 */
  function toggleTop(panel: Exclude<MiniPlayerTopPanel, "none">) {
    void setLayout({
      ...layout.value,
      top: layout.value.top === panel ? "none" : panel,
    });
  }

  /** 队列独立于上方面板，可以同时展开 */
  function toggleQueue() {
    void setLayout({ ...layout.value, queue: !layout.value.queue });
  }

  /**
   * 挂载时对齐一次：插件恢复出来的窗口尺寸可能和存储的布局不一致
   * （用户在别处清了 localStorage、或窗口尺寸被别的路径改过）。
   */
  async function syncWindowSize() {
    try {
      await setMiniPlayerLayout({ layout: layout.value });
    } catch (error) {
      console.error("同步迷你播放器窗口尺寸失败:", error);
    }
  }

  return { layout, setLayout, toggleTop, toggleQueue, syncWindowSize };
}

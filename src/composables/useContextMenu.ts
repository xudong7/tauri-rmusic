import { ref } from "vue";

export interface ContextMenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  action?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * 全局单例的右键菜单状态。
 *
 * 菜单本身由 App.vue 里唯一的一个 `<ContextMenu />` 渲染，任何行/卡片只负责
 * 调 `open()` 并给出动作。做成单例而不是每个组件各挂一份：同一时刻只可能
 * 有一个菜单，而列表里每行都挂实例既浪费又会出现两份菜单同屏。
 */
const state = ref<ContextMenuState | null>(null);

export function useContextMenu() {
  function open(event: MouseEvent, items: ContextMenuItem[]) {
    // 全是禁用项时不弹空菜单
    if (items.every((item) => item.disabled)) return;
    state.value = { x: event.clientX, y: event.clientY, items };
  }

  function close() {
    state.value = null;
  }

  function select(key: string) {
    const item = state.value?.items.find((candidate) => candidate.key === key);
    close();
    item?.action?.();
  }

  return { state, open, close, select };
}

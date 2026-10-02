import { ref } from "vue";

export interface ContextMenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  action?: () => void;
  /** 二级菜单；有值时该项本身不触发动作，悬停/点击展开子菜单 */
  children?: ContextMenuItem[];
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

/** 递归查找：子菜单项也能通过 select(key) 触发 */
function findItem(items: ContextMenuItem[], key: string): ContextMenuItem | undefined {
  for (const item of items) {
    if (item.key === key) return item;
    if (item.children) {
      const found = findItem(item.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

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
    const item = state.value ? findItem(state.value.items, key) : undefined;
    close();
    item?.action?.();
  }

  return { state, open, close, select };
}

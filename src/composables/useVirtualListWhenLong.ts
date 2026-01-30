import { computed, unref, type MaybeRef } from "vue";
import { useVirtualList } from "@vueuse/core";
import {
  LIST_ROW_HEIGHT,
  VIRTUAL_LIST_THRESHOLD,
  VIRTUAL_LIST_OVERSCAN,
} from "@/constants";

export interface UseVirtualListWhenLongOptions<T = unknown> {
  /** 源数组（ref 或 computed），如 computed(() => props.items) */
  source: MaybeRef<readonly T[]>;
  /** 行高，默认使用全局 LIST_ROW_HEIGHT */
  itemHeight?: number;
  /** 超过该数量启用虚拟滚动，默认 VIRTUAL_LIST_THRESHOLD */
  threshold?: number;
  /** 预渲染条数，默认 VIRTUAL_LIST_OVERSCAN */
  overscan?: number;
}

/**
 * 列表较长时启用虚拟滚动，只渲染可视区域。
 * 供 MusicList、PlaylistView 等长列表复用，便于统一阈值与行高。
 */
export function useVirtualListWhenLong<T>(options: UseVirtualListWhenLongOptions<T>) {
  const {
    source,
    itemHeight = LIST_ROW_HEIGHT,
    threshold = VIRTUAL_LIST_THRESHOLD,
    overscan = VIRTUAL_LIST_OVERSCAN,
  } = options;

  const useVirtual = computed(() => unref(source).length > threshold);
  const {
    list: virtualList,
    containerProps,
    wrapperProps,
  } = useVirtualList(source, {
    itemHeight,
    overscan,
  });

  return {
    /** 是否启用虚拟滚动（列表长度 > threshold） */
    useVirtual,
    /** 虚拟列表可见项（仅当 useVirtual 为 true 时使用） */
    virtualList,
    /** 绑定到滚动容器的 props */
    containerProps,
    /** 绑定到列表包裹层的 props */
    wrapperProps,
    /** 行高，用于虚拟列表行的 style */
    rowHeight: itemHeight,
  };
}

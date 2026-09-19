import { ref, shallowRef, watch } from "vue";

/**
 * 列表多选状态。
 *
 * 键由调用方定义（本地列表用文件 key、播放列表用下标），数据源收缩时
 * 自动剔除已消失的选中项，避免批量操作作用到不存在的行上。
 */
export function useRowSelection<K>(options: {
  /** 全选时选中的键，可与数据源不同（如只选当前过滤结果） */
  getSelectableKeys: () => K[];
  /** 数据源中仍存在的键，用于剔除失效的选中项 */
  getAvailableKeys: () => Set<K>;
}) {
  const selectionMode = ref(false);
  // 集合整体替换而非原地增删，shallowRef 足够且省去深层代理
  const selectedKeys = shallowRef(new Set<K>());

  function toggleSelectionMode() {
    selectionMode.value = !selectionMode.value;
    if (!selectionMode.value) selectedKeys.value = new Set();
  }

  function toggleSelectRow(key: K) {
    if (!selectionMode.value) return;
    const next = new Set(selectedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedKeys.value = next;
  }

  function selectAll() {
    selectedKeys.value = new Set(options.getSelectableKeys());
  }

  function deselectAll() {
    selectedKeys.value = new Set();
  }

  function clearSelection() {
    selectedKeys.value = new Set();
    selectionMode.value = false;
  }

  watch(
    () => options.getAvailableKeys(),
    (available) => {
      if (!selectionMode.value || selectedKeys.value.size === 0) return;
      const next = new Set(
        Array.from(selectedKeys.value).filter((key) => available.has(key))
      );
      if (next.size !== selectedKeys.value.size) selectedKeys.value = next;
    }
  );

  return {
    selectionMode,
    selectedKeys,
    toggleSelectionMode,
    toggleSelectRow,
    selectAll,
    deselectAll,
    clearSelection,
  };
}

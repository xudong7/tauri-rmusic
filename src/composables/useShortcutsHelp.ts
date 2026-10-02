import { ref } from "vue";

/**
 * 快捷键帮助浮层的开关状态（模块级单例）。
 *
 * App 渲染唯一一份 ShortcutsOverlay；快捷键处理与浮层关闭按钮都只改这里的
 * 状态，不各自持有副本。
 */
const isShortcutsHelpOpen = ref(false);

export function useShortcutsHelp() {
  function openShortcutsHelp() {
    isShortcutsHelpOpen.value = true;
  }

  function closeShortcutsHelp() {
    isShortcutsHelpOpen.value = false;
  }

  function toggleShortcutsHelp() {
    isShortcutsHelpOpen.value = !isShortcutsHelpOpen.value;
  }

  return {
    isShortcutsHelpOpen,
    openShortcutsHelp,
    closeShortcutsHelp,
    toggleShortcutsHelp,
  };
}

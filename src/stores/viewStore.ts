import { ref } from "vue";
import { defineStore } from "pinia";
import { ViewMode } from "@/types/model";

export const useViewStore = defineStore("view", () => {
  const viewMode = ref<ViewMode>(ViewMode.LOCAL);
  const showImmersiveMode = ref(false);
  /** 在线模块内最后访问路径（搜索页 /online 或歌手页 /artist/:id），用于从本地/设置返回时恢复 */
  const lastOnlinePath = ref("/online");

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
  }

  function setLastOnlinePath(path: string) {
    lastOnlinePath.value = path;
  }

  function showImmersive() {
    showImmersiveMode.value = true;
  }

  function exitImmersive() {
    showImmersiveMode.value = false;
  }

  return {
    viewMode,
    showImmersiveMode,
    lastOnlinePath,
    setViewMode,
    setLastOnlinePath,
    showImmersive,
    exitImmersive,
  };
});

import { ref } from "vue";
import { defineStore } from "pinia";
import { ViewMode } from "@/types/model";

export const useViewStore = defineStore("view", () => {
  const viewMode = ref<ViewMode>(ViewMode.LOCAL);
  const showImmersiveMode = ref(false);

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
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
    setViewMode,
    showImmersive,
    exitImmersive,
  };
});

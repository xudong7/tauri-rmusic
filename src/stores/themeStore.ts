import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { STORAGE_KEY_THEME } from "@/constants";

export type ThemeMode = "light" | "dark" | "warm";

const THEME_VALID: ThemeMode[] = ["light", "dark", "warm"];

export const useThemeStore = defineStore("theme", () => {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  const themeMode = ref<ThemeMode>(
    THEME_VALID.includes(saved as ThemeMode) ? (saved as ThemeMode) : "light"
  );

  const isDarkMode = computed(() => themeMode.value === "dark");

  function setThemeByTime() {
    const hours = new Date().getHours();
    const next: ThemeMode = hours < 8 || hours >= 18 ? "dark" : "light";
    if (themeMode.value !== next) {
      themeMode.value = next;
      localStorage.setItem(STORAGE_KEY_THEME, next);
      applyTheme();
    }
  }

  function applyTheme() {
    document.documentElement.classList.remove("dark", "theme-warm");
    document.body.setAttribute("data-theme", themeMode.value);
    if (themeMode.value === "dark") {
      document.documentElement.classList.add("dark");
    } else if (themeMode.value === "warm") {
      document.documentElement.classList.add("theme-warm");
    }
  }

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    localStorage.setItem(STORAGE_KEY_THEME, mode);
    applyTheme();
  }

  function setThemeWithoutSave(mode: ThemeMode) {
    themeMode.value = mode;
    applyTheme();
  }

  /** 供应用启动时调用：优先使用保存的 theme，否则按时间自动设置 */
  function initializeTheme() {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (!THEME_VALID.includes(saved as ThemeMode)) setThemeByTime();
    else applyTheme();
  }

  return {
    themeMode,
    isDarkMode,
    setThemeByTime,
    applyTheme,
    setThemeMode,
    setThemeWithoutSave,
    initializeTheme,
  };
});

import { ref, computed } from "vue";
import { defineStore } from "pinia";

export type ThemeMode = "light" | "dark" | "warm";

const THEME_VALID: ThemeMode[] = ["light", "dark", "warm"];

export const useThemeStore = defineStore("theme", () => {
  const saved = localStorage.getItem("theme");
  const themeMode = ref<ThemeMode>(
    THEME_VALID.includes(saved as ThemeMode) ? (saved as ThemeMode) : "light"
  );

  const isDarkMode = computed(() => themeMode.value === "dark");

  function setThemeByTime() {
    const hours = new Date().getHours();
    const next: ThemeMode = hours < 8 || hours >= 18 ? "dark" : "light";
    if (themeMode.value !== next) {
      themeMode.value = next;
      localStorage.setItem("theme", next);
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
    localStorage.setItem("theme", mode);
    applyTheme();
  }

  function setThemeWithoutSave(mode: ThemeMode) {
    themeMode.value = mode;
    applyTheme();
  }

  /** 供应用启动时调用：优先使用保存的 theme，否则按时间自动设置 */
  function initializeTheme() {
    const saved = localStorage.getItem("theme");
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

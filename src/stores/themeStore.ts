import { ref } from "vue";
import { defineStore } from "pinia";

export const useThemeStore = defineStore("theme", () => {
  const savedTheme = localStorage.getItem("theme");
  const isDarkMode = ref(savedTheme ? savedTheme === "dark" : false);

  function setThemeByTime() {
    const hours = new Date().getHours();
    const shouldBeDark = hours < 8 || hours >= 18;
    if (isDarkMode.value !== shouldBeDark) {
      isDarkMode.value = shouldBeDark;
      localStorage.setItem("theme", shouldBeDark ? "dark" : "light");
      applyTheme();
    }
  }

  function applyTheme() {
    if (isDarkMode.value) {
      document.documentElement.classList.add("dark");
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.setAttribute("data-theme", "light");
    }
  }

  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value;
    localStorage.setItem("theme", isDarkMode.value ? "dark" : "light");
    applyTheme();
  }

  function setTheme(dark: boolean) {
    isDarkMode.value = dark;
    localStorage.setItem("theme", dark ? "dark" : "light");
    applyTheme();
  }

  function setThemeWithoutSave(dark: boolean) {
    isDarkMode.value = dark;
    applyTheme();
  }

  /** 供应用启动时调用：优先使用保存的 theme，否则按时间自动设置 */
  function initializeTheme() {
    const saved = localStorage.getItem("theme");
    if (!saved) setThemeByTime();
    else applyTheme();
  }

  return {
    isDarkMode,
    setThemeByTime,
    applyTheme,
    toggleTheme,
    setTheme,
    setThemeWithoutSave,
    initializeTheme,
  };
});

import type { ThemeMode } from "@/stores/themeStore";

const THEME_MODES: ThemeMode[] = ["light", "dark", "warm"];

export function useStorageThemeSync(options: {
  setThemeWithoutSave: (theme: ThemeMode) => void;
}) {
  function handleStorageChange(event: StorageEvent) {
    if (
      event.key === "theme" &&
      event.newValue &&
      THEME_MODES.includes(event.newValue as ThemeMode)
    ) {
      options.setThemeWithoutSave(event.newValue as ThemeMode);
    }
  }

  function start() {
    window.addEventListener("storage", handleStorageChange);
  }

  function stop() {
    window.removeEventListener("storage", handleStorageChange);
  }

  return { start, stop };
}

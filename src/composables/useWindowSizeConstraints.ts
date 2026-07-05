import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowSizeConstraints(options: {
  minWidth: number;
  minHeight: number;
}) {
  async function apply() {
    try {
      await getCurrentWindow().setSizeConstraints(options);
    } catch (error) {
      console.error("Set window size constraints error:", error);
    }
  }

  return { apply };
}

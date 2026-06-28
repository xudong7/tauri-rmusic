import { getCurrentWindow } from "@tauri-apps/api/window";

const NO_DRAG_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[role='button']",
  ".el-button",
  ".el-input",
  ".el-slider",
  ".window-controls",
  "[data-no-drag]",
].join(",");

export function useWindowDrag() {
  const currentWindow = getCurrentWindow();

  async function startWindowDrag(event: MouseEvent) {
    if (event.button !== 0 || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest(NO_DRAG_SELECTOR)) return;

    event.preventDefault();

    try {
      await currentWindow.startDragging();
    } catch (error) {
      console.error("Start window drag error:", error);
    }
  }

  return { startWindowDrag };
}

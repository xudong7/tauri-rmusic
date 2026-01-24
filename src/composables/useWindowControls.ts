/**
 * 窗口控制逻辑 composable（minimize / maximize / close）
 * 供 HeaderBar、ImmersiveView、SettingsWindow 复用，降低重复
 */
import { ref, onMounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";

type AppWindow = ReturnType<typeof getCurrentWindow> | null;

export function useWindowControls(options?: { onClose?: "hide" | "close" }) {
  const onCloseAction = options?.onClose ?? "hide";
  let appWindow: AppWindow = null;
  const isMaximized = ref(false);

  async function checkMaximized() {
    if (!appWindow) return;
    isMaximized.value = await appWindow.isMaximized();
  }

  const minimize = async () => {
    if (!appWindow) return;
    await appWindow.minimize();
  };

  const toggleMaximize = async () => {
    if (!appWindow) return;
    if (isMaximized.value) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
    isMaximized.value = !isMaximized.value;
  };

  const close = async () => {
    if (!appWindow) return;
    if (onCloseAction === "hide") {
      await appWindow.hide();
    } else {
      await appWindow.close();
    }
  };

  onMounted(async () => {
    try {
      appWindow = getCurrentWindow();
      await checkMaximized();
      appWindow?.onResized?.(checkMaximized);
    } catch (e) {
      console.error("窗口操作错误:", e);
    }
  });

  return {
    isMaximized,
    checkMaximized,
    minimize,
    toggleMaximize,
    close,
  };
}

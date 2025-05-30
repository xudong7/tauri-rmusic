import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function createSettingsWindow(_options = {}) {
  try {
    const windowOptions = {
      width: 800,
      height: 600,
      resizable: true,
      decorations: false, // 无边框窗口，使用自定义标题栏
      center: true,
      url: "/settings", // 直接在URL中指定路由路径
    };

    const settingWindow = new WebviewWindow("settings", windowOptions);

    settingWindow.once("tauri://created", () => {
      console.log("Login window created successfully");
    });
    settingWindow.once("tauri://error", (e) => {
      console.error("Error creating login window:", e);
    });

    return settingWindow;
  } catch (error) {
    console.error("Failed to create login window:", error);
    return null;
  }
}
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function createSettingsWindow() {
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
      console.log("设置窗口创建成功");
    });
    settingWindow.once("tauri://error", (e) => {
      console.error("创建设置窗口失败:", e);
    });

    return settingWindow;
  } catch (error) {
    console.error("创建设置窗口失败:", error);
    return null;
  }
}

//! 桌面歌词悬浮窗。
//!
//! 独立 webview 窗口（label = "lyrics"），无边框、置顶、透明；
//! 前端入口在 main.ts 按窗口 label 选择 LyricsOverlay 组件渲染。
//! 歌词内容由主窗口通过 Tauri 事件推送，两个窗口之间不共享状态。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LYRICS_WINDOW_LABEL: &str = "lyrics";

/// 打开或关闭桌面歌词窗。命令幂等：重复打开只 show，不存在时关闭是空操作。
#[tauri::command]
pub async fn set_lyrics_window(app_handle: AppHandle, open: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(LYRICS_WINDOW_LABEL) {
        if open {
            window
                .show()
                .map_err(|e| format!("show lyrics window: {}", e))?;
        } else {
            window
                .close()
                .map_err(|e| format!("close lyrics window: {}", e))?;
        }
        return Ok(());
    }

    if !open {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app_handle,
        LYRICS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Rmusic Lyrics")
    .inner_size(680.0, 150.0)
    .min_inner_size(320.0, 96.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(true)
    .build()
    .map_err(|e| format!("create lyrics window: {}", e))?;

    Ok(())
}

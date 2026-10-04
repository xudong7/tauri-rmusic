//! 迷你播放器窗口。
//!
//! 独立 webview 窗口（label = "mini-player"），无边框、透明、置顶、固定尺寸；
//! 前端入口在 main.ts 按窗口 label 选择 MiniPlayer 组件渲染。
//!
//! 主窗才是播放状态的唯一持有者（队列、歌单、本地曲库都只存在于那边），
//! mini 窗只接收 `mini-player-state` 快照、回抛 `mini-player-action` 指令。
//! 进度不走主窗推送：主窗隐藏后它的播放时钟停在 document.hidden 上，
//! 由 mini 窗自己轮询 get_playback_state 并本地外推（同桌面歌词）。
//!
//! 窗口位置不需要在这里持久化：window-state 插件对每个窗口都会自动
//! save（Moved/Exit）与 restore（on_window_ready），这里只管首次打开的落点。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const MINI_PLAYER_WINDOW_LABEL: &str = "mini-player";

/// 窗口比迷你条本体四周各多 8px：给 CSS 投影和圆角留出透明边距。
const WINDOW_WIDTH: f64 = 400.0;
const WINDOW_HEIGHT: f64 = 76.0;
const SCREEN_MARGIN: f64 = 32.0;

/// 打开或关闭迷你播放器窗。命令幂等：重复打开只 show，不存在时关闭是空操作。
#[tauri::command]
pub async fn set_mini_player_window(app_handle: AppHandle, open: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(MINI_PLAYER_WINDOW_LABEL) {
        if open {
            window
                .show()
                .map_err(|e| format!("show mini player window: {}", e))?;
            if window.is_minimized().unwrap_or(false) {
                window
                    .unminimize()
                    .map_err(|e| format!("unminimize mini player window: {}", e))?;
            }
            window
                .set_focus()
                .map_err(|e| format!("focus mini player window: {}", e))?;
        } else {
            window
                .close()
                .map_err(|e| format!("close mini player window: {}", e))?;
        }
        return Ok(());
    }

    if !open {
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        MINI_PLAYER_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Rmusic Mini Player")
    .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
    // 固定尺寸 + 不可最大化：迷你条被拖大只会露出透明底色，没有意义。
    // 双击拖拽区在 macOS 上会触发 zoom，所以 maximizable 也要关。
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .shadow(false)
    .visible(true);

    if let Some((x, y)) = initial_position(&app_handle) {
        builder = builder.position(x, y);
    }

    builder
        .build()
        .map_err(|e| format!("create mini player window: {}", e))?;

    Ok(())
}

/// 首次打开时的落点：主显示器右下角，留出边距。
///
/// 之后的打开由 window-state 插件恢复用户拖过的位置，不会回到这里。
/// 取不到显示器（无头环境/权限异常）时返回 None，交给平台默认落点。
fn initial_position(app: &AppHandle) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    Some((
        origin.x + size.width - WINDOW_WIDTH - SCREEN_MARGIN,
        origin.y + size.height - WINDOW_HEIGHT - SCREEN_MARGIN,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 动态建的窗口不会自动获得能力（capability）：`default.json` 的 windows
    /// 数组漏了这个 label，mini 窗里所有 Tauri 调用都会被 ACL 拒绝，而报错
    /// 只会出现在运行时、且看不出根因。从源码层面钉住。
    #[test]
    fn window_label_is_declared_in_default_capability() {
        let source = include_str!("../capabilities/default.json");
        let config: serde_json::Value =
            serde_json::from_str(source).expect("capabilities/default.json 不是合法 JSON");
        let labels = config["windows"]
            .as_array()
            .expect("capabilities/default.json 缺少 windows 数组");

        assert!(
            labels
                .iter()
                .any(|label| label.as_str() == Some(MINI_PLAYER_WINDOW_LABEL)),
            "capabilities/default.json 的 windows 里必须有 {}",
            MINI_PLAYER_WINDOW_LABEL
        );
    }
}

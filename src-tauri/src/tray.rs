use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri::{App, AppHandle};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::broadcast::Sender;

use crate::music::MusicState;
use crate::service;

/// 托盘退出时留给前端 flush 歌单的窗口。
/// 歌单落盘是本地 JSON 写入，正常情况下远小于这个值；留得宽裕是为了避免
/// 打断一次正常的保存，代价只是 webview 假死时多等这一会儿。
const FRONTEND_QUIT_GRACE_MS: u64 = 3_000;

pub fn quit_app(app: &AppHandle) {
    if let Err(e) = app.save_window_state(StateFlags::all()) {
        eprintln!("Failed to save window state: {}", e);
    }
    if let Some(process) = app.try_state::<service::OnlineServiceProcess>() {
        if let Err(e) = service::shutdown_service(process.inner()) {
            eprintln!("Failed to shutdown sidecar: {}", e);
        }
    }
    app.exit(0);
}

/// set up the tray
pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // 使用 MenuBuilder 构建托盘菜单：播放控制、上一曲/下一曲、分隔符、显示/隐藏、退出
    let menu = MenuBuilder::new(app)
        .text("play", "Play")
        .text("pause", "Pause")
        .text("prev", "Previous")
        .text("next", "Next")
        .separator()
        .text("show_hide", "Show / Hide")
        .separator()
        .text("quit", "Quit")
        .build()?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "play" => {
                if let Some(sender) = app.try_state::<Sender<MusicState>>() {
                    let _ = sender.inner().send(MusicState::Recovery);
                    let _ = app.emit("tray-play", ());
                }
            }
            "pause" => {
                if let Some(sender) = app.try_state::<Sender<MusicState>>() {
                    let _ = sender.inner().send(MusicState::Pause);
                    let _ = app.emit("tray-pause", ());
                }
            }
            "prev" => {
                let _ = app.emit("tray-prev", ());
            }
            "next" => {
                let _ = app.emit("tray-next", ());
            }
            "show_hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    match window.is_visible() {
                        Ok(true) => {
                            let _ = window.hide();
                        }
                        _ => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
            "quit" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                // 前端要先 flush 歌单再退出，所以这里先发事件等它。
                // 但 emit 只是把消息投递出去，webview 正在重载或已崩溃时它照样
                // 返回 Ok，而没有任何人处理——原来的 `if let Err` 兜底因此永远
                // 不会触发，用户会发现在托盘里点 Quit 完全没反应，且没有别的
                // 退出入口。改成定时兜底：窗口期内没退出就无条件退出。
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        FRONTEND_QUIT_GRACE_MS,
                    ))
                    .await;
                    // 前端已正常退出时这里不会有任何机会执行；若执行了，
                    // shutdown_service 是幂等的（内部 take()）。
                    quit_app(&handle);
                });
                if let Err(e) = app.emit("tray-quit", ()) {
                    eprintln!("Failed to emit tray quit event: {}", e);
                }
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    let _tray = tray_builder.build(app)?;
    Ok(())
}

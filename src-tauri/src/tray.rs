use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri::{App, AppHandle};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::broadcast::Sender;

use crate::music::MusicState;
use crate::service;

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
                if let Err(e) = app.emit("tray-quit", ()) {
                    eprintln!("Failed to emit tray quit event: {}", e);
                    quit_app(app);
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

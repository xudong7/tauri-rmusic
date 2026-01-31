use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::broadcast::Sender;

use crate::music::MusicState;
use crate::service;

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

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
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
                app.save_window_state(StateFlags::all()).unwrap();
                if let Err(e) = service::shutdown_service("app") {
                    eprintln!("Failed to shutdown app service: {}", e);
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

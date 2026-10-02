use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri::{App, AppHandle};
use tauri_plugin_window_state::AppHandleExt;
use tokio::sync::broadcast::Sender;

use crate::music::MusicState;
use crate::service;
use crate::window_state;

/// 托盘图标的固定 id：语言/正在播放更新时用它取回托盘实例
const TRAY_ID: &str = "main";

/// 托盘菜单文案，由前端按当前语言下发
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub play: String,
    pub pause: String,
    pub previous: String,
    pub next: String,
    pub show_hide: String,
    pub quit: String,
}

fn build_tray_menu(
    app: &AppHandle,
    labels: &TrayLabels,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    MenuBuilder::new(app)
        .text("play", &labels.play)
        .text("pause", &labels.pause)
        .text("prev", &labels.previous)
        .text("next", &labels.next)
        .separator()
        .text("show_hide", &labels.show_hide)
        .separator()
        .text("quit", &labels.quit)
        .build()
}

/// 更新托盘菜单语言与 tooltip（显示当前曲目）。
///
/// 菜单文案不写死在 Rust：语言状态活在前端，由它按当前 locale 下发，
/// 避免两端各维护一份翻译。
#[tauri::command]
pub fn update_tray_menu(
    app: AppHandle,
    labels: TrayLabels,
    now_playing: Option<String>,
) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };

    let menu = build_tray_menu(&app, &labels).map_err(|e| format!("build tray menu: {}", e))?;
    tray.set_menu(Some(menu))
        .map_err(|e| format!("set tray menu: {}", e))?;

    let tooltip = now_playing
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Rmusic".to_string());
    tray.set_tooltip(Some(tooltip.as_str()))
        .map_err(|e| format!("set tray tooltip: {}", e))?;

    Ok(())
}

/// 托盘退出时留给前端 flush 歌单的窗口。
/// 歌单落盘是本地 JSON 写入，正常情况下远小于这个值；留得宽裕是为了避免
/// 打断一次正常的保存，代价只是 webview 假死时多等这一会儿。
const FRONTEND_QUIT_GRACE_MS: u64 = 3_000;

pub fn quit_app(app: &AppHandle) {
    // 与插件自己在 RunEvent::Exit 上那次保存用同一份标志：带上 VISIBLE 会把
    // 「退出时窗口是隐藏的」写进文件，而主窗口的隐藏/显示现在由预热流程掌管，
    // 不该再让磁盘上的旧状态参与决定。
    if let Err(e) = app.save_window_state(crate::window_state::restore_flags()) {
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
    // 初始菜单用英文：前端挂载后会立刻按当前语言重发一次
    let initial_labels = TrayLabels {
        play: "Play".to_string(),
        pause: "Pause".to_string(),
        previous: "Previous".to_string(),
        next: "Next".to_string(),
        show_hide: "Show / Hide".to_string(),
        quit: "Quit".to_string(),
    };
    let menu = build_tray_menu(app.handle(), &initial_labels)?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
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
                window_state::reveal_main_window(app);
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
                        Ok(true) => window_state::hide_main_window(app),
                        _ => {
                            window_state::reveal_main_window(app);
                        }
                    }
                }
            }
            "quit" => {
                // 退出前先把窗口带回来（应用可能整体被隐藏），让前端完成 flush
                window_state::reveal_main_window(app);
                // 前端要先 flush 歌单再退出，所以这里先发事件等它。
                // 但 emit 只是把消息投递出去，webview 正在重载或已崩溃时它照样
                // 返回 Ok，而没有任何人处理——原来的 `if let Err` 兜底因此永远
                // 不会触发，用户会发现在托盘里点 Quit 完全没反应，且没有别的
                // 退出入口。改成定时兜底：窗口期内没退出就无条件退出。
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(FRONTEND_QUIT_GRACE_MS))
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

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItem};
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
/// 菜单栏里的三个播放控制图标（独立状态项，点击即执行，不带菜单）
const TRAY_PREV_ID: &str = "controls-prev";
const TRAY_PLAY_ID: &str = "controls-play";
const TRAY_NEXT_ID: &str = "controls-next";

/// 模板图标按 18pt 显示；36px 提供 2x 像素密度，视网膜屏不发虚
const CONTROL_ICON_SIZE: u32 = 36;

/// 前端同步过来的播放状态：决定中间图标是「播放」还是「暂停」
#[derive(Default)]
pub struct TrayPlaybackState(pub AtomicBool);

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

/// 控制图标画什么：四个形状都用同一套几何描述生成，不依赖外部资源
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ControlIcon {
    Previous,
    Play,
    Pause,
    Next,
}

#[derive(Debug, Clone, Copy)]
enum ControlAction {
    Previous,
    PlayPause,
    Next,
}

fn point_in_triangle(point: (f64, f64), a: (f64, f64), b: (f64, f64), c: (f64, f64)) -> bool {
    let (px, py) = point;
    let (ax, ay) = a;
    let (bx, by) = b;
    let (cx, cy) = c;
    let d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    let d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    let d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
}

fn point_in_rect(px: f64, py: f64, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
    px >= x0 && px <= x1 && py >= y0 && py <= y1
}

/// 归一化坐标（0..1）下判断某个采样点是否落在图形内
fn icon_hit(kind: ControlIcon, x: f64, y: f64) -> bool {
    match kind {
        ControlIcon::Play => point_in_triangle((x, y), (0.32, 0.18), (0.32, 0.82), (0.82, 0.5)),
        ControlIcon::Pause => {
            point_in_rect(x, y, 0.30, 0.18, 0.45, 0.82)
                || point_in_rect(x, y, 0.55, 0.18, 0.70, 0.82)
        }
        ControlIcon::Next => {
            point_in_triangle((x, y), (0.20, 0.18), (0.20, 0.82), (0.62, 0.5))
                || point_in_rect(x, y, 0.68, 0.18, 0.80, 0.82)
        }
        ControlIcon::Previous => {
            point_in_triangle((x, y), (0.80, 0.18), (0.80, 0.82), (0.38, 0.5))
                || point_in_rect(x, y, 0.20, 0.18, 0.32, 0.82)
        }
    }
}

/// 生成模板图标 RGBA：黑色 + 覆盖率作为 alpha，4x4 超采样抗锯齿。
/// macOS 会按模板自动适配深浅色菜单栏。
fn render_control_icon(kind: ControlIcon) -> Vec<u8> {
    const SAMPLES: u32 = 4;
    let size = CONTROL_ICON_SIZE as usize;
    let mut data = vec![0u8; size * size * 4];

    for y in 0..size {
        for x in 0..size {
            let mut hits = 0u32;
            for sy in 0..SAMPLES {
                for sx in 0..SAMPLES {
                    let px = (x as f64 + (sx as f64 + 0.5) / SAMPLES as f64) / size as f64;
                    let py = (y as f64 + (sy as f64 + 0.5) / SAMPLES as f64) / size as f64;
                    if icon_hit(kind, px, py) {
                        hits += 1;
                    }
                }
            }
            if hits == 0 {
                continue;
            }
            let index = (y * size + x) * 4;
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = (hits * 255 / (SAMPLES * SAMPLES)) as u8;
        }
    }

    data
}

fn control_icon_image(kind: ControlIcon) -> Image<'static> {
    Image::new_owned(
        render_control_icon(kind),
        CONTROL_ICON_SIZE,
        CONTROL_ICON_SIZE,
    )
}

/// 播放/暂停共用一条路径：先给后端发状态（即时生效），再通知前端同步 store
fn toggle_playback_from_tray(app: &AppHandle, playing: bool) {
    if let Some(sender) = app.try_state::<Sender<MusicState>>() {
        let state = if playing {
            MusicState::Pause
        } else {
            MusicState::Recovery
        };
        let _ = sender.inner().send(state);
    }
    let event = if playing { "tray-pause" } else { "tray-play" };
    let _ = app.emit(event, ());
}

fn build_tray_menu(
    app: &AppHandle,
    labels: &TrayLabels,
    now_playing: Option<&str>,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut builder = MenuBuilder::new(app);

    // 正在播放单独占一行（禁用项）：macOS 上 tooltip 不一定被看到，
    // 菜单里直接写出来最直观
    if let Some(text) = now_playing.filter(|value| !value.trim().is_empty()) {
        let item = MenuItem::with_id(app, "now_playing", text, false, None::<&str>)?;
        builder = builder.item(&item).separator();
    }

    builder
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

    let menu = build_tray_menu(&app, &labels, now_playing.as_deref())
        .map_err(|e| format!("build tray menu: {}", e))?;
    tray.set_menu(Some(menu))
        .map_err(|e| format!("set tray menu: {}", e))?;

    let tooltip = now_playing
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Rmusic".to_string());
    tray.set_tooltip(Some(tooltip.as_str()))
        .map_err(|e| format!("set tray tooltip: {}", e))?;

    // 控制图标 tooltip 跟语言走；中间那个还要按播放状态选「播放/暂停」
    for (id, text) in [
        (TRAY_PREV_ID, &labels.previous),
        (TRAY_NEXT_ID, &labels.next),
    ] {
        if let Some(control) = app.tray_by_id(id) {
            let _ = control.set_tooltip(Some(text.as_str()));
        }
    }
    if let Some(control) = app.tray_by_id(TRAY_PLAY_ID) {
        let playing = app
            .try_state::<TrayPlaybackState>()
            .map(|state| state.0.load(Ordering::SeqCst))
            .unwrap_or(false);
        let text = if playing { &labels.pause } else { &labels.play };
        let _ = control.set_tooltip(Some(text.as_str()));
    }

    Ok(())
}

/// 同步播放状态：换中间图标（播放/暂停）并更新 tooltip。
/// 由前端在 isPlaying 变化与语言切换时调用。
#[tauri::command]
pub fn update_tray_playback_state(
    app: AppHandle,
    playing: bool,
    tooltip: Option<String>,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<TrayPlaybackState>() {
        state.0.store(playing, Ordering::SeqCst);
    }

    let Some(tray) = app.tray_by_id(TRAY_PLAY_ID) else {
        return Ok(());
    };

    let kind = if playing {
        ControlIcon::Pause
    } else {
        ControlIcon::Play
    };
    tray.set_icon(Some(control_icon_image(kind)))
        .map_err(|e| format!("set tray icon: {}", e))?;
    // macOS 的 set_icon 会清掉模板标记，必须重新声明，否则深色菜单栏下是黑块
    tray.set_icon_as_template(true)
        .map_err(|e| format!("set tray template: {}", e))?;

    if let Some(text) = tooltip {
        tray.set_tooltip(Some(text.as_str()))
            .map_err(|e| format!("set tray tooltip: {}", e))?;
    }

    Ok(())
}

fn build_control_tray(
    app: &App,
    id: &'static str,
    kind: ControlIcon,
    tooltip: &str,
    action: ControlAction,
) -> tauri::Result<()> {
    TrayIconBuilder::with_id(id)
        .icon(control_icon_image(kind))
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        .tooltip(tooltip)
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                match action {
                    ControlAction::Previous => {
                        let _ = app.emit("tray-prev", ());
                    }
                    ControlAction::Next => {
                        let _ = app.emit("tray-next", ());
                    }
                    ControlAction::PlayPause => {
                        let playing = app
                            .try_state::<TrayPlaybackState>()
                            .map(|state| state.0.load(Ordering::SeqCst))
                            .unwrap_or(false);
                        toggle_playback_from_tray(app, playing);
                    }
                }
            }
        })
        .build(app)?;
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
    let menu = build_tray_menu(app.handle(), &initial_labels, None)?;

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

    // 播放状态默认「未播放」；前端挂载后会立刻同步真实状态
    app.manage(TrayPlaybackState::default());

    let _tray = tray_builder.build(app)?;

    // macOS 新的状态项插在已有项左侧，所以创建顺序要与视觉顺序相反：
    // 依次建 next/play/prev，菜单栏里才是 [上一首][播放][下一首][应用图标]。
    build_control_tray(
        app,
        TRAY_NEXT_ID,
        ControlIcon::Next,
        "Next",
        ControlAction::Next,
    )?;
    build_control_tray(
        app,
        TRAY_PLAY_ID,
        ControlIcon::Play,
        "Play",
        ControlAction::PlayPause,
    )?;
    build_control_tray(
        app,
        TRAY_PREV_ID,
        ControlIcon::Previous,
        "Previous",
        ControlAction::Previous,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_ICONS: [ControlIcon; 4] = [
        ControlIcon::Previous,
        ControlIcon::Play,
        ControlIcon::Pause,
        ControlIcon::Next,
    ];

    fn opaque_pixels(kind: ControlIcon) -> usize {
        render_control_icon(kind)
            .chunks_exact(4)
            .filter(|pixel| pixel[3] > 0)
            .count()
    }

    fn flip_horizontal(data: &[u8], size: usize) -> Vec<u8> {
        let mut flipped = vec![0u8; data.len()];
        for y in 0..size {
            for x in 0..size {
                let source = (y * size + x) * 4;
                let target = (y * size + (size - 1 - x)) * 4;
                flipped[target..target + 4].copy_from_slice(&data[source..source + 4]);
            }
        }
        flipped
    }

    #[test]
    fn control_icons_render_visible_pixels() {
        for kind in ALL_ICONS {
            let data = render_control_icon(kind);
            assert_eq!(
                data.len(),
                (CONTROL_ICON_SIZE * CONTROL_ICON_SIZE * 4) as usize
            );
            assert!(
                opaque_pixels(kind) > 100,
                "{:?} should have visible pixels",
                kind
            );
        }
    }

    #[test]
    fn play_and_pause_icons_are_different_shapes() {
        assert_ne!(
            render_control_icon(ControlIcon::Play),
            render_control_icon(ControlIcon::Pause)
        );
    }

    #[test]
    fn previous_and_next_are_horizontal_mirrors() {
        let size = CONTROL_ICON_SIZE as usize;
        let previous = render_control_icon(ControlIcon::Previous);
        let next = render_control_icon(ControlIcon::Next);
        assert_eq!(flip_horizontal(&previous, size), next);
    }

    #[test]
    fn triangle_hit_test_marks_inside_and_outside() {
        assert!(icon_hit(ControlIcon::Play, 0.45, 0.5));
        assert!(!icon_hit(ControlIcon::Play, 0.9, 0.5));
    }
}

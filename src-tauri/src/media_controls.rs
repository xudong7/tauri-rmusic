//! 操作系统媒体控制。
//!
//! 通过 souvlaki 对接 macOS Now Playing、Windows SMTC 与 Linux MPRIS：
//! 元数据由前端在切歌/播放状态变化时推来，媒体键事件再以 Tauri 事件
//! 发回主窗，由前端走与托盘/快捷键相同的播放控制路径。
//!
//! 前端与 Rust 的分工是刻意的：播放状态与队列都活在前端，Rust 只做
//! 「系统控件适配器」，不持有第二份播放状态。

use std::sync::Mutex;
use std::time::Duration;

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use tauri::{AppHandle, Emitter, Manager};

/// 与系统媒体控制的连接。souvlaki 的 MediaControls 是 Send + Sync，
/// 直接挂进 Tauri 托管状态，随应用生命周期存在。
#[derive(Default)]
pub struct MediaControlsState {
    controls: Mutex<Option<MediaControls>>,
}

/// 发回前端的媒体键事件
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum MediaControlPayload {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Stop,
    SeekRelative { offset_ms: i64 },
    SeekAbsolute { position_ms: i64 },
    SetVolume { volume: f64 },
    Raise,
}

/// 前端推来的元数据与播放状态
#[derive(Debug, Clone, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadataPayload {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_url: Option<String>,
    pub duration_ms: Option<f64>,
    pub position_ms: Option<f64>,
    pub is_playing: bool,
    pub volume: Option<f64>,
}

/// 创建并接上系统媒体控制。失败只打日志：媒体键不可用不该影响应用启动。
pub fn setup(app: &AppHandle) {
    let config = PlatformConfig {
        dbus_name: "com.rmusic.app",
        display_name: "Rmusic",
        hwnd: platform_hwnd(app),
    };

    let mut controls = match MediaControls::new(config) {
        Ok(controls) => controls,
        Err(error) => {
            eprintln!("Failed to create media controls: {}", error);
            return;
        }
    };

    let handle = app.clone();
    if let Err(error) = controls.attach(move |event| dispatch(&handle, event)) {
        eprintln!("Failed to attach media controls: {}", error);
        return;
    }

    match app.state::<MediaControlsState>().controls.lock() {
        Ok(mut slot) => *slot = Some(controls),
        Err(_) => eprintln!("Media controls state lock poisoned"),
    }
}

/// Windows 的 SMTC 需要一个 HWND；macOS / Linux 不需要。
#[cfg(target_os = "windows")]
fn platform_hwnd(app: &AppHandle) -> Option<*mut std::ffi::c_void> {
    app.get_webview_window("main")
        .and_then(|window| window.hwnd().ok())
        .map(|hwnd| hwnd.0)
}

#[cfg(not(target_os = "windows"))]
fn platform_hwnd(_app: &AppHandle) -> Option<*mut std::ffi::c_void> {
    None
}

/// 没有给定时长的系统 Seek（部分平台只报方向）按 10 秒处理
const UNSPECIFIED_SEEK_MS: i64 = 10_000;

fn direction_sign(direction: SeekDirection) -> i64 {
    match direction {
        SeekDirection::Forward => 1,
        SeekDirection::Backward => -1,
    }
}

fn dispatch(app: &AppHandle, event: MediaControlEvent) {
    let payload = match event {
        MediaControlEvent::Play => MediaControlPayload::Play,
        MediaControlEvent::Pause => MediaControlPayload::Pause,
        MediaControlEvent::Toggle => MediaControlPayload::Toggle,
        MediaControlEvent::Next => MediaControlPayload::Next,
        MediaControlEvent::Previous => MediaControlPayload::Previous,
        MediaControlEvent::Stop => MediaControlPayload::Stop,
        MediaControlEvent::Seek(direction) => MediaControlPayload::SeekRelative {
            offset_ms: direction_sign(direction) * UNSPECIFIED_SEEK_MS,
        },
        MediaControlEvent::SeekBy(direction, duration) => MediaControlPayload::SeekRelative {
            offset_ms: direction_sign(direction) * duration.as_millis() as i64,
        },
        MediaControlEvent::SetPosition(position) => MediaControlPayload::SeekAbsolute {
            position_ms: position.0.as_millis() as i64,
        },
        MediaControlEvent::SetVolume(volume) => MediaControlPayload::SetVolume { volume },
        MediaControlEvent::Raise => MediaControlPayload::Raise,
        // OpenUri / Quit 等对本应用没有意义，忽略
        _ => return,
    };

    if let Err(error) = app.emit_to("main", "media-control", payload) {
        eprintln!("Failed to emit media control event: {}", error);
    }
}

/// 前端推来当前曲目与播放状态时更新系统控件。
#[tauri::command]
pub fn update_media_metadata(
    state: tauri::State<'_, MediaControlsState>,
    payload: MediaMetadataPayload,
) {
    let Ok(mut guard) = state.controls.lock() else {
        return;
    };
    let Some(controls) = guard.as_mut() else {
        return;
    };

    let _ = controls.set_metadata(MediaMetadata {
        title: payload.title.as_deref(),
        artist: payload.artist.as_deref(),
        album: payload.album.as_deref(),
        cover_url: payload.cover_url.as_deref(),
        duration: payload
            .duration_ms
            .map(|ms| Duration::from_millis(ms.max(0.0) as u64)),
    });

    let progress = payload
        .position_ms
        .map(|ms| MediaPosition(Duration::from_millis(ms.max(0.0) as u64)));
    let _ = controls.set_playback(if payload.is_playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    });

    // set_volume 只在 MPRIS（Linux）后端存在，其他平台由系统自行处理音量
    #[cfg(target_os = "linux")]
    if let Some(volume) = payload.volume {
        let _ = controls.set_volume(volume.clamp(0.0, 1.0));
    }
    #[cfg(not(target_os = "linux"))]
    let _ = payload.volume;
}

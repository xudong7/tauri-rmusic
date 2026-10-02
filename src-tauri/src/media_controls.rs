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

    // 封面 URL 必须先净化：macOS 的 souvlaki 对加载失败的 NSImage 不做空检查，
    // 空串或指向不存在文件的 URL 会直接把进程打崩（objc 对 nil 的结构体返回解引用）。
    let cover_url = sanitize_cover_url(payload.cover_url.as_deref());

    let _ = controls.set_metadata(MediaMetadata {
        title: payload.title.as_deref(),
        artist: payload.artist.as_deref(),
        album: payload.album.as_deref(),
        cover_url: cover_url.as_deref(),
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

/// 封面文件是否是解码器能识别的图片格式（JPEG / PNG / WebP 的魔数）。
///
/// 损坏或改了扩展名的文件会让 macOS 的 NSImage 返回 nil，而 souvlaki 对 nil
/// 不做检查——所以宁可跳过封面，也不能把未知内容交给它。
fn looks_like_supported_image(path: &std::path::Path) -> bool {
    use std::io::Read;

    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut head = [0u8; 12];
    let Ok(read) = file.read(&mut head) else {
        return false;
    };
    let bytes = &head[..read];

    bytes.starts_with(&[0xFF, 0xD8, 0xFF]) // JPEG
        || bytes.starts_with(&[0x89, b'P', b'N', b'G']) // PNG
        || (bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP")
}

/// 封面 URL 净化：空串、无 scheme、指向不存在或非图片文件的一律丢弃。
///
/// macOS 的 souvlaki 在 `load_image_from_url` 里对 `NSImage` 不做空检查，
/// 加载失败的 URL 会让 `[nil size]` 这样的结构体返回直接崩掉进程；因此
/// macOS 上只接受已验证存在的本地 file:// 图片。其他平台（SMTC / MPRIS）
/// 通过各自的异步机制取图，http(s) 可以安全透传。
pub(crate) fn sanitize_cover_url(raw: Option<&str>) -> Option<String> {
    let url = raw?.trim();
    if url.is_empty() {
        return None;
    }

    if let Some(path) = url.strip_prefix("file://") {
        let decoded = urlencoding::decode(path)
            .map(|value| value.into_owned())
            .unwrap_or_else(|_| path.to_string());
        let path = std::path::Path::new(&decoded);
        return (path.is_file() && looks_like_supported_image(path)).then(|| url.to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // macOS 只能安全使用本地文件
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        (url.starts_with("http://") || url.starts_with("https://")).then(|| url.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_cover_url_drops_empty_and_untrusted_values() {
        assert_eq!(sanitize_cover_url(None), None);
        assert_eq!(sanitize_cover_url(Some("")), None);
        assert_eq!(sanitize_cover_url(Some("   ")), None);
        assert_eq!(
            sanitize_cover_url(Some("file:///definitely/not/here.jpg")),
            None
        );
        assert_eq!(sanitize_cover_url(Some("ftp://example.com/a.jpg")), None);
    }

    #[test]
    fn sanitize_cover_url_keeps_existing_local_files() {
        let dir = std::env::temp_dir().join(format!("rmusic-cover-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a b.jpg");
        // JPEG 魔数开头：内容不必是完整图片，但必须像图片
        std::fs::write(&path, b"\xFF\xD8\xFF\xE0fake-jpeg").unwrap();

        let url = format!("file://{}", path.to_string_lossy().replace(' ', "%20"));
        let sanitized = sanitize_cover_url(Some(&url));
        assert_eq!(sanitized.as_deref(), Some(url.as_str()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sanitize_cover_url_drops_non_image_files() {
        let dir =
            std::env::temp_dir().join(format!("rmusic-cover-test-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fake.jpg");
        std::fs::write(&path, b"not an image at all").unwrap();

        let url = format!("file://{}", path.to_string_lossy());
        assert_eq!(sanitize_cover_url(Some(&url)), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn sanitize_cover_url_keeps_remote_urls_off_macos() {
        assert_eq!(
            sanitize_cover_url(Some("https://example.com/a.jpg")).as_deref(),
            Some("https://example.com/a.jpg")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn sanitize_cover_url_rejects_remote_urls_on_macos() {
        // macOS 的 souvlaki 对加载失败的远程图直接崩溃，宁可不显示封面
        assert_eq!(sanitize_cover_url(Some("https://example.com/a.jpg")), None);
    }
}

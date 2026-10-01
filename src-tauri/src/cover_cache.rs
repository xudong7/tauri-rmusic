//! 在线封面的磁盘缓存。
//!
//! 列表与网格里的封面走 WebView 自带的 HTTP 缓存；这里只服务「当前播放曲目的
//! 封面」这类始终可见、且恢复上次会话后要立刻出现的图片：首次下载落盘，之后
//! 经 asset 协议直接读本地文件，不再等网络。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use sha1::{Digest, Sha1};
use tauri::Manager;

/// 缓存文件数上限，超出按修改时间从旧到新清理。
const MAX_CACHED_COVERS: usize = 500;
/// 单张封面上限：正常封面在几十 KB 量级，8MB 已是很宽松的兜底。
const MAX_COVER_BYTES: u64 = 8 * 1024 * 1024;

fn cover_cache_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("resolve cover cache dir: {}", e))?
        .join("online-covers");
    fs::create_dir_all(&dir).map_err(|e| format!("create cover cache dir: {}", e))?;
    Ok(dir)
}

/// 缓存键：URL 的 SHA-1（整串参与，包括 ?param=300y300 这类尺寸参数）。
pub(crate) fn cover_cache_key(url: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 从 URL 推断图片扩展名。只认白名单，其余一律按 jpg 存——asset 协议靠扩展名
/// 决定 Content-Type，乱推断会让浏览器拿到错误类型。
pub(crate) fn cover_extension_for_url(url: &str) -> &'static str {
    let without_fragment = url.split('#').next().unwrap_or(url);
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    match Path::new(without_query)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "png",
        Some("webp") => "webp",
        Some("jpg") | Some("jpeg") => "jpg",
        _ => "jpg",
    }
}

pub(crate) fn is_remote_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

fn prune_cover_cache(dir: &Path) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(SystemTime, PathBuf)> = read_dir
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();
    if files.len() <= MAX_CACHED_COVERS {
        return;
    }

    files.sort_by_key(|(modified, _)| *modified);
    let remove_count = files.len() - MAX_CACHED_COVERS;
    for (_, path) in files.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }
}

/// 下载并缓存封面，返回本地文件路径供前端经 asset 协议渲染。
///
/// 失败一律返回 `Ok(None)`：封面只是装饰，拿不到时前端回退到原始 URL 直接
/// 走网络，不该让一个命令错误打断播放界面。
#[tauri::command]
pub async fn cache_online_cover(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<Option<String>, String> {
    if !is_remote_url(&url) {
        return Ok(None);
    }

    let dir = cover_cache_dir(&app_handle)?;
    let path = dir.join(format!(
        "{}.{}",
        cover_cache_key(&url),
        cover_extension_for_url(&url)
    ));

    if !path.is_file() {
        let client = crate::netease::get_client()?;
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("fetch cover: {}", e))?;
        if !response.status().is_success() {
            return Ok(None);
        }
        if response
            .content_length()
            .is_some_and(|len| len > MAX_COVER_BYTES)
        {
            return Ok(None);
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("read cover bytes: {}", e))?;
        if bytes.is_empty() || bytes.len() as u64 > MAX_COVER_BYTES {
            return Ok(None);
        }

        let temp_path = crate::fs_util::unique_temp_path_for(&path);
        fs::write(&temp_path, &bytes).map_err(|e| format!("write cover temp: {}", e))?;
        crate::fs_util::commit_temp_file(&temp_path, &path)?;
        prune_cover_cache(&dir);
    }

    app_handle
        .asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| format!("allow cover asset path error: {}", e))?;
    path.to_str()
        .map(|path| Some(path.to_string()))
        .ok_or_else(|| "cover path trans error".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_is_stable_and_url_sensitive() {
        let a = cover_cache_key("https://p1.music.126.net/a.jpg?param=300y300");
        let b = cover_cache_key("https://p1.music.126.net/a.jpg?param=300y300");
        let c = cover_cache_key("https://p1.music.126.net/a.jpg?param=600y600");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 40);
    }

    #[test]
    fn extension_follows_url_and_falls_back_to_jpg() {
        assert_eq!(
            cover_extension_for_url("https://x/a.png?param=300y300"),
            "png"
        );
        assert_eq!(cover_extension_for_url("https://x/a.JPEG"), "jpg");
        assert_eq!(cover_extension_for_url("https://x/a.webp#frag"), "webp");
        // 没有扩展名、或扩展名不在白名单里：统一 jpg
        assert_eq!(cover_extension_for_url("https://x/cover?id=1"), "jpg");
        assert_eq!(cover_extension_for_url("https://x/track.gif"), "jpg");
    }

    #[test]
    fn only_http_urls_are_cacheable() {
        assert!(is_remote_url("http://localhost:3000/a.jpg"));
        assert!(is_remote_url("https://p1.music.126.net/a.jpg"));
        assert!(!is_remote_url("file:///tmp/a.jpg"));
        assert!(!is_remote_url("/tmp/a.jpg"));
        assert!(!is_remote_url(""));
    }
}

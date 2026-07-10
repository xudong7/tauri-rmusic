// 播放列表持久化：在应用数据目录读写 playlists.json，与前端 Playlist/PlaylistItem 结构一致

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const PLAYLISTS_FILE: &str = "playlists.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongInfo {
    pub id: String,
    pub name: String,
    pub artists: Vec<String>,
    pub album: String,
    pub duration: u64,
    #[serde(default)]
    pub pic_url: String,
    #[serde(default)]
    pub file_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlaylistItem {
    #[serde(rename = "local")]
    Local { file_name: String },
    #[serde(rename = "online")]
    Online { song: SongInfo },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub items: Vec<PlaylistItem>,
    pub created_at: u64,
}

fn playlists_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    Ok(dir.join(PLAYLISTS_FILE))
}

fn unique_temp_path_for(target_path: &Path) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("playlists.json");

    target_path.with_file_name(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        unique
    ))
}

fn commit_temp_file(tmp_path: &Path, target_path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    if target_path.exists() {
        fs::remove_file(target_path).map_err(|e| format!("replace playlists file: {}", e))?;
    }

    fs::rename(tmp_path, target_path).map_err(|e| format!("commit playlists file: {}", e))
}

fn write_playlists_to_path(path: &Path, playlists: &[Playlist]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create app_data_dir: {}", e))?;
    }

    let tmp_path = unique_temp_path_for(path);
    let result: Result<(), String> = (|| {
        let f =
            File::create(&tmp_path).map_err(|e| format!("create playlists temp file: {}", e))?;
        let mut writer = BufWriter::new(f);
        serde_json::to_writer_pretty(&mut writer, playlists)
            .map_err(|e| format!("serialize playlists: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("flush playlists: {}", e))?;
        writer
            .get_ref()
            .sync_all()
            .map_err(|e| format!("sync playlists: {}", e))?;
        drop(writer);
        commit_temp_file(&tmp_path, path)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }

    result
}

/// 从应用数据目录读取播放列表
#[tauri::command]
pub fn read_playlists(app_handle: AppHandle) -> Result<Vec<Playlist>, String> {
    let path = playlists_path(&app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = File::open(&path).map_err(|e| format!("open playlists: {}", e))?;
    let reader = BufReader::new(f);
    let list: Vec<Playlist> =
        serde_json::from_reader(reader).map_err(|e| format!("parse playlists: {}", e))?;
    Ok(list)
}

/// 将播放列表写入应用数据目录
#[tauri::command]
pub fn write_playlists(app_handle: AppHandle, playlists: Vec<Playlist>) -> Result<(), String> {
    let path = playlists_path(&app_handle)?;
    write_playlists_to_path(&path, &playlists)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("rmusic-{}-{}-{}", name, std::process::id(), unique))
    }

    #[test]
    fn unique_temp_path_stays_next_to_playlists_file() {
        let target = Path::new("/tmp/rmusic-data/playlists.json");
        let tmp = unique_temp_path_for(target);

        assert_eq!(tmp.parent(), target.parent());
        assert_ne!(tmp, target);
        assert!(tmp
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| { name.starts_with("playlists.json.") && name.ends_with(".tmp") }));
    }

    #[test]
    fn write_playlists_to_path_commits_valid_json() {
        let dir = unique_test_dir("playlist-write");
        let path = dir.join("playlists.json");
        let playlists = vec![Playlist {
            id: "pl_test".into(),
            name: "Test".into(),
            items: vec![PlaylistItem::Local {
                file_name: "Artist - Song.mp3".into(),
            }],
            created_at: 123,
        }];

        write_playlists_to_path(&path, &playlists).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let restored: Vec<Playlist> = serde_json::from_str(&content).unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].id, "pl_test");
        assert_eq!(restored[0].items.len(), 1);
        assert!(fs::read_dir(&dir).unwrap().flatten().all(|entry| entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            != Some("tmp")));

        let _ = fs::remove_dir_all(dir);
    }
}

// 播放列表持久化：在应用数据目录读写 playlists.json，与前端 Playlist/PlaylistItem 结构一致

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::PathBuf;
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

/// 从应用数据目录读取播放列表
#[tauri::command]
pub fn read_playlists(app_handle: AppHandle) -> Result<Vec<Playlist>, String> {
    let path = playlists_path(&app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = File::open(&path).map_err(|e| format!("open playlists: {}", e))?;
    let reader = BufReader::new(f);
    let list: Vec<Playlist> = serde_json::from_reader(reader).map_err(|e| format!("parse playlists: {}", e))?;
    Ok(list)
}

/// 将播放列表写入应用数据目录
#[tauri::command]
pub fn write_playlists(app_handle: AppHandle, playlists: Vec<Playlist>) -> Result<(), String> {
    let path = playlists_path(&app_handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create app_data_dir: {}", e))?;
    }
    let f = File::create(&path).map_err(|e| format!("create playlists file: {}", e))?;
    let mut writer = BufWriter::new(f);
    serde_json::to_writer_pretty(&mut writer, &playlists).map_err(|e| format!("serialize playlists: {}", e))?;
    writer.flush().map_err(|e| format!("flush playlists: {}", e))?;
    Ok(())
}

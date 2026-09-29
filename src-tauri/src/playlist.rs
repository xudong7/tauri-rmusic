// 播放列表持久化：在应用数据目录读写 playlists.json，与前端 Playlist/PlaylistItem 结构一致

use crate::fs_util::{commit_temp_file, unique_temp_path_for};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlaylistItem {
    #[serde(rename = "local")]
    Local {
        file_name: String,
        /// 这首歌的来源（从在线搜索加进来的才有）。文件被删之后靠它重新下载；
        /// 用户自己导入的本地文件没有来源，因此也没有这一项。
        ///
        /// `default` 让旧文件（没这个字段）照常读得出来，
        /// `skip_serializing_if` 让不该有的时候不写 `"source": null`。
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source: Option<SongInfo>,
    },
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
    use std::time::{SystemTime, UNIX_EPOCH};

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
                source: None,
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

    /// 旧文件里没有 `source` 字段，必须照常读得出来——否则用户升级之后
    /// 一打开应用就报「歌单读取失败」。
    #[test]
    fn reads_playlists_written_before_items_had_a_source() {
        let legacy = r#"[
          {
            "id": "pl_1",
            "name": "夜鹿",
            "createdAt": 1,
            "items": [{ "type": "local", "file_name": "a.mp3" }]
          }
        ]"#;
        let list: Vec<Playlist> = serde_json::from_str(legacy).unwrap();

        assert_eq!(list.len(), 1);
        match &list[0].items[0] {
            PlaylistItem::Local { file_name, source } => {
                assert_eq!(file_name, "a.mp3");
                assert!(source.is_none());
            }
            other => panic!("应当读成 local 条目，实际是 {other:?}"),
        }
    }

    /// 有来源的条目要能原样往返——那是「重新下载」唯一的依据。
    /// 没有来源的条目不写 `"source": null`（`skip_serializing_if`）。
    #[test]
    fn round_trips_the_source_but_omits_it_when_absent() {
        let with_source = PlaylistItem::Local {
            file_name: "a.mp3".into(),
            source: Some(SongInfo {
                id: "1".into(),
                name: "Track".into(),
                artists: vec!["Artist".into()],
                album: "Album".into(),
                duration: 1000,
                pic_url: "http://x/p.jpg".into(),
                file_hash: "hash".into(),
                album_id: Some("al1".into()),
                artist_ids: Some(vec!["ar1".into()]),
            }),
        };
        let json = serde_json::to_string(&with_source).unwrap();
        assert!(json.contains("\"source\""));
        assert!(json.contains("\"album_id\""));
        let back: PlaylistItem = serde_json::from_str(&json).unwrap();
        match back {
            PlaylistItem::Local { source, .. } => {
                let source = source.expect("来源要能读回来");
                assert_eq!(source.id, "1");
                assert_eq!(source.album_id.as_deref(), Some("al1"));
                assert_eq!(source.artist_ids, Some(vec!["ar1".to_string()]));
            }
            other => panic!("应当读成 local 条目，实际是 {other:?}"),
        }

        let without = PlaylistItem::Local {
            file_name: "b.mp3".into(),
            source: None,
        };
        let json = serde_json::to_string(&without).unwrap();
        assert!(
            !json.contains("source"),
            "没有来源时不该写 null，那是噪音：{json}"
        );
    }
}

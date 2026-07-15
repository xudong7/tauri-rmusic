use rodio::{Decoder, OutputStream, Sink, Source};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, ErrorKind};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, OnceLock, Weak};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast::Sender;
use tokio::sync::{broadcast, Mutex};

use crate::netease;

const MAX_ONLINE_AUDIO_CACHE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ONLINE_AUDIO_CACHE_FILES: usize = 200;
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
static CACHE_DOWNLOAD_LOCKS: OnceLock<StdMutex<HashMap<PathBuf, Weak<Mutex<()>>>>> =
    OnceLock::new();

#[derive(Serialize, Debug)]
pub struct PlaybackProgress {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_ended: bool,
}

#[derive(Serialize, Debug)]
pub struct PlaybackState {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_ended: bool,
    pub is_paused: bool,
    pub has_track: bool,
    pub track_id: u64,
}

#[derive(Serialize, Debug)]
pub struct PlayStartResult {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_paused: bool,
    pub has_track: bool,
    pub track_id: u64,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlaybackSource {
    Local { path: String },
    Online { url: String, cache_key: String },
}

pub struct Music {
    pub event_sender: Sender<MusicState>,
    _stream: OutputStream,
    pub sink: Arc<Mutex<Sink>>,
    pub current_duration_ms: PlaybackDurationState,
    pub current_track_id: PlaybackTrackIdState,
}

#[derive(Clone)]
pub struct PlaybackDurationState(pub Arc<Mutex<u64>>);

#[derive(Clone)]
pub struct PlaybackTrackIdState(pub Arc<Mutex<u64>>);

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MusicFile {
    pub id: i32,
    pub file_name: String,
    pub key: String,
    pub relative_path: String,
    pub extension: String,
    pub modified_ms: u64,
    pub search_text: String,
}

#[derive(Debug, Clone)]
pub enum MusicState {
    Recovery,
    Pause,
    Volume(f32),
}

impl Music {
    pub fn new() -> Result<Self, String> {
        let (event_sender, mut event_receiver) = broadcast::channel(100);

        let (_stream, stream_handle) =
            OutputStream::try_default().map_err(|e| format!("init audio output: {}", e))?;
        let sink = Arc::new(Mutex::new(
            Sink::try_new(&stream_handle).map_err(|e| format!("init audio sink: {}", e))?,
        ));
        let sink_clone = Arc::clone(&sink);
        let duration_clone = Arc::new(Mutex::new(0u64));
        let track_id = Arc::new(Mutex::new(0u64));

        // spawn a thread to handle the music events
        tokio::spawn(async move {
            // receive events from the channel
            while let Ok(event) = event_receiver.recv().await {
                match event {
                    MusicState::Recovery => {
                        let sink = sink_clone.lock().await;
                        sink.play();
                    }
                    MusicState::Pause => {
                        let sink = sink_clone.lock().await;
                        sink.pause();
                    }
                    MusicState::Volume(volume) => {
                        let sink = sink_clone.lock().await;
                        // 使用平方曲线：人耳对响度接近对数感知，线性滑块在两端变化不明显。
                        // normalized^2 使低端更静、高端保持最大，滑块两端变化更明显。
                        let normalized = (volume / 100.0).clamp(0.0, 1.0);
                        let curved = normalized * normalized;
                        sink.set_volume(curved * 2.0);
                    }
                }
            }
        });

        Ok(Self {
            event_sender,
            _stream,
            sink,
            current_duration_ms: PlaybackDurationState(duration_clone),
            current_track_id: PlaybackTrackIdState(track_id),
        })
    }
}

fn decode_file(path: &Path) -> Result<(Decoder<BufReader<File>>, u64), String> {
    let file =
        File::open(path).map_err(|e| format!("open audio file error {}: {}", path.display(), e))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("decode audio file error: {}", e))?;
    let duration_ms = source
        .total_duration()
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok((source, duration_ms))
}

async fn append_file_to_sink(
    path: &Path,
    sink: Arc<Mutex<Sink>>,
    duration: Arc<Mutex<u64>>,
) -> Result<(), String> {
    let (source, duration_ms) = decode_file(path)?;
    {
        let mut dur = duration.lock().await;
        *dur = duration_ms;
    }
    let sink_lock = sink.lock().await;
    sink_lock.clear();
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }
    Ok(())
}

fn online_cache_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("unable to get app cache dir: {}", e))?
        .join("online-audio");
    fs::create_dir_all(&cache_dir).map_err(|e| format!("create online cache dir: {}", e))?;
    Ok(cache_dir)
}

fn online_cache_path(app_handle: &AppHandle, cache_key: &str) -> Result<PathBuf, String> {
    let cache_dir = online_cache_dir(app_handle)?;
    let mut hasher = Sha1::new();
    hasher.update(b"v2:");
    hasher.update(cache_key.as_bytes());
    let digest = format!("{:x}", hasher.finalize());

    Ok(cache_dir.join(format!("{}.audio", digest)))
}

fn unique_temp_path_for(target_path: &Path) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cache");
    target_path.with_file_name(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        unique
    ))
}

fn online_download_lock(cache_path: &Path) -> Result<Arc<Mutex<()>>, String> {
    let locks = CACHE_DOWNLOAD_LOCKS.get_or_init(|| StdMutex::new(HashMap::new()));
    let mut locks = locks
        .lock()
        .map_err(|_| "online cache download lock poisoned".to_string())?;
    locks.retain(|_, lock| lock.upgrade().is_some());

    if let Some(lock) = locks.get(cache_path).and_then(Weak::upgrade) {
        return Ok(lock);
    }

    let lock = Arc::new(Mutex::new(()));
    locks.insert(cache_path.to_path_buf(), Arc::downgrade(&lock));
    Ok(lock)
}

fn online_cache_entries(app_handle: &AppHandle) -> Result<Vec<(PathBuf, u64, u64)>, String> {
    let cache_dir = online_cache_dir(app_handle)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(cache_dir).map_err(|e| format!("read online cache dir: {}", e))? {
        let entry = entry.map_err(|e| format!("read online cache entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("audio") {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|e| format!("read online cache metadata: {}", e))?;
        let age_ms = metadata
            .accessed()
            .or_else(|_| metadata.modified())
            .ok()
            .and_then(|last_used| last_used.elapsed().ok())
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(u64::MAX);
        entries.push((path, metadata.len(), age_ms));
    }

    Ok(entries)
}

fn is_clearable_online_cache_artifact(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("audio") | Some("tmp")
    )
}

fn prune_online_audio_cache(app_handle: &AppHandle) -> Result<(), String> {
    let mut entries = online_cache_entries(app_handle)?;
    entries.sort_by_key(|(_, _, age_ms)| *age_ms);

    let mut total_size: u64 = entries.iter().map(|(_, size, _)| *size).sum();
    while entries.len() > MAX_ONLINE_AUDIO_CACHE_FILES || total_size > MAX_ONLINE_AUDIO_CACHE_BYTES
    {
        let Some((path, size, _)) = entries.pop() else {
            break;
        };
        if fs::remove_file(path).is_ok() {
            total_size = total_size.saturating_sub(size);
        }
    }

    Ok(())
}

async fn cached_online_file(
    app_handle: &AppHandle,
    url: &str,
    cache_key: &str,
) -> Result<PathBuf, String> {
    let cache_path = online_cache_path(app_handle, cache_key)?;
    if cache_path.exists() {
        return Ok(cache_path);
    }

    let download_lock = online_download_lock(&cache_path)?;
    let _download_guard = download_lock.lock().await;
    if cache_path.exists() {
        return Ok(cache_path);
    }

    let client = netease::get_client()?;
    let mut response = netease::get_response(client, url.to_string()).await?;

    let tmp_path = unique_temp_path_for(&cache_path);
    let result: Result<(), String> = async {
        let mut file = tokio::fs::File::create(&tmp_path)
            .await
            .map_err(|e| format!("create online cache file error: {}", e))?;
        while let Some(chunk) = tokio::time::timeout(STREAM_IDLE_TIMEOUT, response.chunk())
            .await
            .map_err(|_| {
                format!(
                    "online audio download stalled for {}s",
                    STREAM_IDLE_TIMEOUT.as_secs()
                )
            })?
            .map_err(|e| format!("read response data error: {}", e))?
        {
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("write online cache error: {}", e))?;
        }
        file.flush()
            .await
            .map_err(|e| format!("flush online cache error: {}", e))?;
        drop(file);

        match tokio::fs::hard_link(&tmp_path, &cache_path).await {
            Ok(()) => {
                tokio::fs::remove_file(&tmp_path)
                    .await
                    .map_err(|e| format!("remove online cache temp file: {}", e))?;
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
            }
            Err(error) => return Err(format!("commit online cache error: {}", error)),
        }
        Ok(())
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&tmp_path).await;
    }
    result?;

    prune_online_audio_cache(app_handle)?;
    Ok(cache_path)
}

#[tauri::command]
pub fn get_online_audio_cache_size(app_handle: AppHandle) -> Result<u64, String> {
    Ok(online_cache_entries(&app_handle)?
        .iter()
        .map(|(_, size, _)| *size)
        .sum())
}

#[tauri::command]
pub fn get_online_audio_cache_path(app_handle: AppHandle) -> Result<String, String> {
    online_cache_dir(&app_handle)?
        .to_str()
        .map(|path| path.to_string())
        .ok_or_else(|| "cache path trans error".to_string())
}

#[tauri::command]
pub fn clear_online_audio_cache(app_handle: AppHandle) -> Result<(), String> {
    let cache_dir = online_cache_dir(&app_handle)?;
    for entry in fs::read_dir(cache_dir).map_err(|e| format!("read online cache dir: {}", e))? {
        let entry = entry.map_err(|e| format!("read online cache entry: {}", e))?;
        let path = entry.path();
        if is_clearable_online_cache_artifact(&path) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn play_track(
    app_handle: AppHandle,
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, PlaybackDurationState>,
    track_id: tauri::State<'_, PlaybackTrackIdState>,
    source: PlaybackSource,
) -> Result<PlayStartResult, String> {
    let source_path = match source {
        PlaybackSource::Local { path } => PathBuf::from(path),
        PlaybackSource::Online { url, cache_key } => {
            cached_online_file(&app_handle, &url, &cache_key).await?
        }
    };

    append_file_to_sink(&source_path, Arc::clone(&sink), Arc::clone(&duration.0)).await?;

    let next_track_id = {
        let mut id = track_id.0.lock().await;
        *id = id.saturating_add(1);
        *id
    };
    let duration_ms = *duration.0.lock().await;

    Ok(PlayStartResult {
        position_ms: 0,
        duration_ms,
        is_paused: false,
        has_track: true,
        track_id: next_track_id,
    })
}

#[tauri::command]
pub async fn prefetch_netease_song(app_handle: AppHandle, id: String) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("Empty song id".to_string());
    }

    let url = netease::get_song_url(id.clone()).await?;
    cached_online_file(&app_handle, &url, &id).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_progress(
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, PlaybackDurationState>,
    track_id: tauri::State<'_, PlaybackTrackIdState>,
) -> Result<PlaybackProgress, String> {
    let state = get_playback_state(sink, duration, track_id).await?;
    Ok(PlaybackProgress {
        position_ms: state.position_ms,
        duration_ms: state.duration_ms,
        is_ended: state.is_ended,
    })
}

#[tauri::command]
pub async fn get_playback_state(
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, PlaybackDurationState>,
    track_id: tauri::State<'_, PlaybackTrackIdState>,
) -> Result<PlaybackState, String> {
    let sink = sink.lock().await;
    let position = sink.get_pos();
    let position_ms = position.as_millis() as u64;
    let duration_ms = *duration.0.lock().await;
    let has_track = duration_ms > 0 || !sink.empty() || position_ms > 0;
    let is_ended = has_track && sink.empty() && position_ms > 0;

    Ok(PlaybackState {
        position_ms,
        duration_ms,
        is_ended,
        is_paused: sink.is_paused(),
        has_track,
        track_id: *track_id.0.lock().await,
    })
}

#[derive(Serialize, Debug)]
pub struct SeekResult {
    pub success: bool,
    pub should_play_next: bool,
}

#[tauri::command]
pub async fn seek_to(
    sink: tauri::State<'_, Arc<Mutex<Sink>>>,
    duration: tauri::State<'_, PlaybackDurationState>,
    position_ms: u64,
) -> Result<SeekResult, String> {
    let actual_duration = *duration.0.lock().await;
    if position_ms > actual_duration && actual_duration > 0 {
        return Ok(SeekResult {
            success: false,
            should_play_next: true,
        });
    }
    let sink = sink.lock().await;
    let duration = Duration::from_millis(position_ms);
    sink.try_seek(duration)
        .map_err(|e| format!("seek error: {:?}", e))?;
    Ok(SeekResult {
        success: true,
        should_play_next: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_temp_path_stays_next_to_target_and_changes_name() {
        let target = Path::new("/tmp/rmusic-cache/track.audio");
        let tmp = unique_temp_path_for(target);

        assert_eq!(tmp.parent(), target.parent());
        assert_ne!(tmp, target);
        assert!(tmp
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("track.audio.") && name.ends_with(".tmp")));
    }

    #[test]
    fn clearable_online_cache_artifacts_include_committed_and_temp_files() {
        assert!(is_clearable_online_cache_artifact(Path::new(
            "abc123.audio"
        )));
        assert!(is_clearable_online_cache_artifact(Path::new(
            "abc123.audio.42.99.tmp"
        )));
        assert!(!is_clearable_online_cache_artifact(Path::new("notes.txt")));
        assert!(!is_clearable_online_cache_artifact(Path::new("tmp")));
    }
}

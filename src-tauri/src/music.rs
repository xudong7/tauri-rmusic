use rodio::cpal::FromSample;
use rodio::{Decoder, OutputStream, Sample, Sink, Source};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, BufReader, ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex as StdMutex, OnceLock, Weak};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast::Sender;
use tokio::sync::{broadcast, Mutex};

use crate::netease;

const MAX_ONLINE_AUDIO_CACHE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ONLINE_AUDIO_CACHE_FILES: usize = 200;
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const PLAYBACK_END_POLL_INTERVAL: Duration = Duration::from_millis(250);
const INITIAL_ONLINE_BUFFER_BYTES: u64 = 512 * 1024;
static CACHE_DOWNLOAD_LOCKS: OnceLock<StdMutex<HashMap<PathBuf, Weak<Mutex<()>>>>> =
    OnceLock::new();

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

#[derive(Clone, Serialize, Debug)]
struct PlaybackEndedEvent {
    position_ms: u64,
    duration_ms: u64,
    track_id: u64,
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

#[derive(Clone, Default)]
pub struct PlaybackRequestIdState(pub Arc<AtomicU64>);

#[derive(Default)]
struct ProgressiveDownloadState {
    downloaded: u64,
    total: Option<u64>,
    complete: bool,
    error: Option<String>,
}

type SharedProgressiveDownloadState = Arc<(StdMutex<ProgressiveDownloadState>, Condvar)>;

/// 当前正在播放的在线音频的下载进度。
///
/// 供 `seek_to` 判断目标位置的数据是否已经落盘。在线音频的 `Read` 在数据
/// 未到位时会阻塞在 Condvar 上，而它跑在实时音频线程里：一旦 seek 到尚未
/// 下载的位置，该线程就会卡住，随后切歌时的 `Sink::clear()`（内部等待音源
/// 结束）会在持有 sink 锁的情况下无限期等待，表现为进度条冻结、
/// 上一首/下一首失效。
///
/// 本地音源没有这个概念，此时为 None。
#[derive(Default)]
pub struct ActiveProgressiveDownload(StdMutex<Option<SharedProgressiveDownloadState>>);

impl ActiveProgressiveDownload {
    fn set(&self, state: Option<SharedProgressiveDownloadState>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = state;
        }
    }

    fn get(&self) -> Option<SharedProgressiveDownloadState> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }
}

/// seek 允许落在已下载区间之外的余量。
///
/// 字节偏移是按 `total / duration` 线性估算的，而实际音频含标签头且可能是
/// 变码率，因此留出一段余量，避免把合法的 seek 误判为越界。
const SEEK_FRONTIER_MARGIN_MS: u64 = 2_000;

/// 判断目标播放位置的数据是否已经下载到位。
///
/// 返回 false 表示应当拒绝这次 seek —— 放行会让实时音频线程阻塞。
/// 信息不足时一律放行，保持改动前的行为，不因估算不准而拒绝正常操作。
fn seek_within_downloaded(
    downloaded: u64,
    total: Option<u64>,
    complete: bool,
    position_ms: u64,
    duration_ms: u64,
) -> bool {
    if complete {
        return true;
    }
    // 没有 Content-Length 就无从估算，交给既有的阻塞路径处理
    let (Some(total), true) = (total, duration_ms > 0) else {
        return true;
    };
    if total == 0 {
        return true;
    }

    // downloaded 字节大致对应的播放时长
    let available_ms = downloaded.saturating_mul(duration_ms) / total;
    position_ms <= available_ms.saturating_sub(SEEK_FRONTIER_MARGIN_MS)
}

struct ProgressiveFileReader {
    file: File,
    state: SharedProgressiveDownloadState,
}

struct TempFileCleanup {
    path: PathBuf,
    armed: bool,
}

impl TempFileCleanup {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFileCleanup {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

impl ProgressiveFileReader {
    fn open(path: &Path, state: SharedProgressiveDownloadState) -> Result<Self, String> {
        let file = File::open(path)
            .map_err(|e| format!("open progressive audio file {}: {}", path.display(), e))?;
        Ok(Self { file, state })
    }
}

impl Read for ProgressiveFileReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            let read = self.file.read(buf)?;
            if read > 0 {
                return Ok(read);
            }

            let (lock, signal) = &*self.state;
            let mut state = lock
                .lock()
                .map_err(|_| io::Error::other("progressive download state poisoned"))?;
            if let Some(error) = &state.error {
                return Err(io::Error::other(error.clone()));
            }
            if state.complete {
                return Ok(0);
            }
            state = signal
                .wait(state)
                .map_err(|_| io::Error::other("progressive download wait poisoned"))?;
            drop(state);
        }
    }
}

impl Seek for ProgressiveFileReader {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        match position {
            SeekFrom::End(offset) => {
                let (lock, _) = &*self.state;
                let state = lock
                    .lock()
                    .map_err(|_| io::Error::other("progressive download state poisoned"))?;
                let end = state.total.unwrap_or(state.downloaded);
                let target = (end as i128 + offset as i128).clamp(0, u64::MAX as i128) as u64;
                self.file.seek(SeekFrom::Start(target))
            }
            other => self.file.seek(other),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MusicFile {
    pub id: i32,
    pub file_name: String,
    pub key: String,
    pub relative_path: String,
    pub extension: String,
    pub modified_ms: u64,
    pub search_text: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: u64,
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

fn decode_progressive_file(
    path: &Path,
    state: SharedProgressiveDownloadState,
) -> Result<(Decoder<BufReader<ProgressiveFileReader>>, u64), String> {
    let reader = ProgressiveFileReader::open(path, state)?;
    let source = Decoder::new(BufReader::new(reader))
        .map_err(|e| format!("decode progressive audio file error: {}", e))?;
    let duration_ms = source
        .total_duration()
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok((source, duration_ms))
}

async fn replace_sink_source<S>(
    source: S,
    duration_ms: u64,
    sink: Arc<Mutex<Sink>>,
    duration: Arc<Mutex<u64>>,
    request_state: &PlaybackRequestIdState,
    request_id: u64,
) -> Result<(), String>
where
    S: Source + Send + 'static,
    f32: FromSample<S::Item>,
    S::Item: Sample + Send,
{
    let sink_lock = sink.lock().await;
    ensure_playback_request_current(Some((request_state, request_id)))?;
    let mut dur = duration.lock().await;
    ensure_playback_request_current(Some((request_state, request_id)))?;
    *dur = duration_ms;
    sink_lock.clear();
    sink_lock.append(source);
    if sink_lock.is_paused() {
        sink_lock.play();
    }
    // rodio 的播放位置由音频线程的周期回调维护：换源后要等新音源被拉取一次
    // 才会归零。在那之前 get_pos() 仍返回上一首的位置，而 track_id/duration
    // 已经是新曲——这段窗口里前端的一次进度同步会被判为「当前曲目的有效状态」，
    // 把进度条和本地时钟基准都写成上一首的位置（表现为进度条先停在上一首末尾，
    // 约 10 秒后才被下一次同步纠正）。try_seek 会同步写入 position，立即归零。
    let _ = sink_lock.try_seek(Duration::ZERO);
    Ok(())
}

fn start_playback_end_monitor(
    app_handle: AppHandle,
    sink: Arc<Mutex<Sink>>,
    duration: Arc<Mutex<u64>>,
    current_track_id: Arc<Mutex<u64>>,
    expected_track_id: u64,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(PLAYBACK_END_POLL_INTERVAL).await;

            if *current_track_id.lock().await != expected_track_id {
                return;
            }

            let (is_empty, position_ms) = {
                let sink = sink.lock().await;
                (sink.empty(), sink.get_pos().as_millis() as u64)
            };
            if !is_empty || position_ms == 0 {
                continue;
            }

            let duration_ms = *duration.lock().await;
            let _ = app_handle.emit(
                "playback-ended",
                PlaybackEndedEvent {
                    position_ms,
                    duration_ms,
                    track_id: expected_track_id,
                },
            );
            return;
        }
    });
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

pub(crate) fn is_online_audio_cached(app_handle: &AppHandle, cache_key: &str) -> bool {
    online_cache_path(app_handle, cache_key)
        .ok()
        .and_then(|path| fs::metadata(path).ok())
        .is_some_and(|metadata| metadata.len() > 0)
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

fn set_progressive_download_state(
    shared: &SharedProgressiveDownloadState,
    downloaded: u64,
    total: Option<u64>,
    complete: bool,
    error: Option<String>,
) {
    let (lock, signal) = &**shared;
    if let Ok(mut state) = lock.lock() {
        state.downloaded = downloaded;
        state.total = total;
        state.complete = complete;
        state.error = error;
        signal.notify_all();
    }
}

async fn commit_progressive_cache_file(tmp_path: &Path, cache_path: &Path) -> Result<(), String> {
    match tokio::fs::hard_link(tmp_path, cache_path).await {
        Ok(()) => {
            // An active decoder may still hold the temporary file open on Windows.
            // The cache hard link is already complete, so leftover .tmp cleanup is best-effort.
            let _ = tokio::fs::remove_file(tmp_path).await;
            Ok(())
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let _ = tokio::fs::remove_file(tmp_path).await;
            Ok(())
        }
        Err(error) => Err(format!("commit online cache error: {}", error)),
    }
}

async fn progressive_online_file(
    app_handle: &AppHandle,
    url: &str,
    cache_key: &str,
    request_state: &PlaybackRequestIdState,
    request_id: u64,
) -> Result<(PathBuf, SharedProgressiveDownloadState), String> {
    let cache_path = online_cache_path(app_handle, cache_key)?;
    if let Ok(metadata) = fs::metadata(&cache_path) {
        if metadata.len() > 0 {
            let state = Arc::new((
                StdMutex::new(ProgressiveDownloadState {
                    downloaded: metadata.len(),
                    total: Some(metadata.len()),
                    complete: true,
                    error: None,
                }),
                Condvar::new(),
            ));
            return Ok((cache_path, state));
        }
    }

    let download_lock = online_download_lock(&cache_path)?;
    let download_guard = download_lock.lock_owned().await;
    ensure_playback_request_current(Some((request_state, request_id)))?;
    if let Ok(metadata) = fs::metadata(&cache_path) {
        if metadata.len() > 0 {
            drop(download_guard);
            let state = Arc::new((
                StdMutex::new(ProgressiveDownloadState {
                    downloaded: metadata.len(),
                    total: Some(metadata.len()),
                    complete: true,
                    error: None,
                }),
                Condvar::new(),
            ));
            return Ok((cache_path, state));
        }
    }

    let client = netease::get_client()?;
    let mut response = netease::get_response(client, url.to_string()).await?;
    let total = response.content_length();
    let tmp_path = unique_temp_path_for(&cache_path);
    let mut temp_cleanup = TempFileCleanup::new(tmp_path.clone());
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("create online cache file error: {}", e))?;
    let shared = Arc::new((
        StdMutex::new(ProgressiveDownloadState {
            downloaded: 0,
            total,
            complete: false,
            error: None,
        }),
        Condvar::new(),
    ));
    let buffer_target = total
        .map(|size| size.min(INITIAL_ONLINE_BUFFER_BYTES))
        .unwrap_or(INITIAL_ONLINE_BUFFER_BYTES);
    let mut downloaded = 0u64;
    let mut reached_end = false;

    while downloaded < buffer_target {
        ensure_playback_request_current(Some((request_state, request_id)))?;
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, response.chunk())
            .await
            .map_err(|_| {
                format!(
                    "online audio download stalled for {}s",
                    STREAM_IDLE_TIMEOUT.as_secs()
                )
            })?
            .map_err(|e| format!("read response data error: {}", e))?;
        let Some(chunk) = chunk else {
            reached_end = true;
            break;
        };
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write online cache error: {}", e))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        set_progressive_download_state(&shared, downloaded, total, false, None);
    }
    file.flush()
        .await
        .map_err(|e| format!("flush online cache error: {}", e))?;

    if reached_end {
        drop(file);
        commit_progressive_cache_file(&tmp_path, &cache_path).await?;
        temp_cleanup.disarm();
        set_progressive_download_state(&shared, downloaded, total, true, None);
        drop(download_guard);
        prune_online_audio_cache(app_handle);
        return Ok((cache_path, shared));
    }

    let background_tmp_path = tmp_path.clone();
    let background_cache_path = cache_path.clone();
    let background_shared = Arc::clone(&shared);
    let background_request_state = Arc::clone(&request_state.0);
    let background_app_handle = app_handle.clone();
    temp_cleanup.disarm();
    tauri::async_runtime::spawn(async move {
        let result: Result<u64, String> = async {
            loop {
                if background_request_state.load(Ordering::SeqCst) != request_id {
                    return Err("playback request superseded".to_string());
                }
                let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, response.chunk())
                    .await
                    .map_err(|_| {
                        format!(
                            "online audio download stalled for {}s",
                            STREAM_IDLE_TIMEOUT.as_secs()
                        )
                    })?
                    .map_err(|e| format!("read response data error: {}", e))?;
                let Some(chunk) = chunk else { break };
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("write online cache error: {}", e))?;
                downloaded = downloaded.saturating_add(chunk.len() as u64);
                set_progressive_download_state(&background_shared, downloaded, total, false, None);
            }
            file.flush()
                .await
                .map_err(|e| format!("flush online cache error: {}", e))?;
            drop(file);
            commit_progressive_cache_file(&background_tmp_path, &background_cache_path).await?;
            Ok(downloaded)
        }
        .await;

        match result {
            Ok(final_size) => {
                set_progressive_download_state(&background_shared, final_size, total, true, None);
                prune_online_audio_cache(&background_app_handle);
            }
            Err(error) => {
                let _ = tokio::fs::remove_file(&background_tmp_path).await;
                set_progressive_download_state(
                    &background_shared,
                    downloaded,
                    total,
                    true,
                    Some(error),
                );
            }
        }
        drop(download_guard);
    });

    Ok((tmp_path, shared))
}

fn online_cache_entries(app_handle: &AppHandle) -> Result<Vec<(PathBuf, u64, u64)>, String> {
    let cache_dir = online_cache_dir(app_handle)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(cache_dir).map_err(|e| format!("read online cache dir: {}", e))? {
        // 单个条目读取失败就跳过，不要让整次修剪失败：并发的修剪/提交
        // 随时可能删掉我们正要 stat 的文件。
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("audio") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
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

/// 超过这个时长的 .tmp 文件视为下载中途崩溃（或进程被强杀）留下的残骸。
///
/// 临时文件名里带 pid，正常完成的下载会在提交时删除它；由于 release
/// 配置了 panic = "abort"，进程崩溃时清理守卫不会运行，因此必须靠过期
/// 时间来回收。
const STALE_TEMP_FILE_AGE: Duration = Duration::from_secs(60 * 60);

fn sweep_stale_temp_files(cache_dir: &Path) {
    let Ok(dir) = fs::read_dir(cache_dir) else {
        return;
    };
    let now = SystemTime::now();
    for entry in dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("tmp") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let is_stale = now
            .duration_since(modified)
            .map(|age| age > STALE_TEMP_FILE_AGE)
            .unwrap_or(false);
        if is_stale {
            let _ = fs::remove_file(&path);
        }
    }
}

fn is_clearable_online_cache_artifact(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("audio") | Some("tmp")
    )
}

/// 修剪在线音频缓存。
///
/// 刻意不返回 Result：它位于播放与下载的关键路径上，而修剪失败是完全
/// 无害的（下次再做即可）。早先它返回错误且调用点用 `?` 传播，导致
/// 一首其实已经完整缓存的歌，会因为并发修剪恰好删掉某个正在统计的文件
/// 而报播放失败。
fn prune_online_audio_cache(app_handle: &AppHandle) {
    let cache_dir = match online_cache_dir(app_handle) {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("skip online cache prune: {error}");
            return;
        }
    };

    sweep_stale_temp_files(&cache_dir);

    let mut entries = match online_cache_entries(app_handle) {
        Ok(entries) => entries,
        Err(error) => {
            eprintln!("skip online cache prune: {error}");
            return;
        }
    };
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
}

async fn cached_online_file(
    app_handle: &AppHandle,
    url: &str,
    cache_key: &str,
    playback_request: Option<(&PlaybackRequestIdState, u64)>,
) -> Result<PathBuf, String> {
    ensure_playback_request_current(playback_request)?;
    let cache_path = online_cache_path(app_handle, cache_key)?;
    if cache_path.exists() {
        return Ok(cache_path);
    }

    let download_lock = online_download_lock(&cache_path)?;
    let _download_guard = download_lock.lock().await;
    ensure_playback_request_current(playback_request)?;
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
            ensure_playback_request_current(playback_request)?;
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

    prune_online_audio_cache(app_handle);
    Ok(cache_path)
}

fn ensure_playback_request_current(
    playback_request: Option<(&PlaybackRequestIdState, u64)>,
) -> Result<(), String> {
    if let Some((state, expected)) = playback_request {
        if state.0.load(Ordering::SeqCst) != expected {
            return Err("playback request superseded".to_string());
        }
    }
    Ok(())
}

fn register_playback_request_id(
    state: &PlaybackRequestIdState,
    request_id: u64,
) -> Result<(), String> {
    let previous_request_id = state.0.fetch_max(request_id, Ordering::SeqCst);
    if request_id < previous_request_id {
        return Err("playback request superseded".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn prepare_playback_request(
    request_state: tauri::State<'_, PlaybackRequestIdState>,
    request_id: u64,
) -> Result<(), String> {
    register_playback_request_id(&request_state, request_id)
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
    request_state: tauri::State<'_, PlaybackRequestIdState>,
    active_download: tauri::State<'_, ActiveProgressiveDownload>,
    source: PlaybackSource,
    request_id: u64,
) -> Result<PlayStartResult, String> {
    register_playback_request_id(&request_state, request_id)?;

    match source {
        PlaybackSource::Local { path } => {
            let source_path = PathBuf::from(path);
            let (decoded_source, duration_ms) = decode_file(&source_path)?;
            ensure_playback_request_current(Some((&request_state, request_id)))?;
            replace_sink_source(
                decoded_source,
                duration_ms,
                Arc::clone(&sink),
                Arc::clone(&duration.0),
                &request_state,
                request_id,
            )
            .await?;
            // 本地音源没有下载进度可言，清掉上一首在线曲目留下的记录，
            // 否则 seek_to 会拿旧曲目的前沿来判断当前这首
            active_download.set(None);
        }
        PlaybackSource::Online { url, cache_key } => {
            let resolved_url = if url.trim().is_empty() {
                netease::get_song_url(cache_key.clone()).await?
            } else {
                url
            };
            let (source_path, download_state) = progressive_online_file(
                &app_handle,
                &resolved_url,
                &cache_key,
                &request_state,
                request_id,
            )
            .await?;
            ensure_playback_request_current(Some((&request_state, request_id)))?;
            let (decoded_source, duration_ms) =
                decode_progressive_file(&source_path, Arc::clone(&download_state))?;
            ensure_playback_request_current(Some((&request_state, request_id)))?;
            replace_sink_source(
                decoded_source,
                duration_ms,
                Arc::clone(&sink),
                Arc::clone(&duration.0),
                &request_state,
                request_id,
            )
            .await?;
            // 登记在替换成功之后：被取代的请求不应覆盖当前播放曲目的进度，
            // 否则 seek_to 会拿另一首的下载前沿来判断。
            active_download.set(Some(download_state));
        }
    }
    let next_track_id = {
        let mut id = track_id.0.lock().await;
        *id = id.saturating_add(1);
        *id
    };

    let duration_ms = *duration.0.lock().await;
    start_playback_end_monitor(
        app_handle,
        Arc::clone(&sink),
        Arc::clone(&duration.0),
        Arc::clone(&track_id.0),
        next_track_id,
    );

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
    if is_online_audio_cached(&app_handle, &id) {
        return Ok(());
    }

    let url = netease::get_song_url(id.clone()).await?;
    cached_online_file(&app_handle, &url, &id, None).await?;
    Ok(())
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
    active_download: tauri::State<'_, ActiveProgressiveDownload>,
    position_ms: u64,
) -> Result<SeekResult, String> {
    let actual_duration = *duration.0.lock().await;
    if position_ms > actual_duration && actual_duration > 0 {
        return Ok(SeekResult {
            success: false,
            should_play_next: true,
        });
    }

    // 目标位置的数据可能还没下载到。此时必须拒绝：放行会让实时音频线程
    // 阻塞在 Read 上，而它卡住之后，下一次切歌的 Sink::clear() 会在持有
    // sink 锁的情况下无限期等待 —— 表现为进度条冻结、切歌失效。
    // 返回 success:false 而不是报错：这是正常的用户操作被数据进度挡下。
    if let Some(state) = active_download.get() {
        let (downloaded, total, complete) = match state.0.lock() {
            Ok(guard) => (guard.downloaded, guard.total, guard.complete),
            // 锁中毒说明后台下载线程 panic 了，不值得再冒险放行
            Err(_) => (0, None, false),
        };
        if !seek_within_downloaded(downloaded, total, complete, position_ms, actual_duration) {
            return Ok(SeekResult {
                success: false,
                should_play_next: false,
            });
        }
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
    fn seek_allowed_anywhere_once_download_completed() {
        // 已完整下载：随便跳
        assert!(seek_within_downloaded(
            1000,
            Some(1000),
            true,
            300_000,
            300_000
        ));
    }

    #[test]
    fn seek_beyond_downloaded_frontier_is_refused() {
        // 10 分钟的曲目下了 1/10（约 60 秒），跳到第 5 分钟必然阻塞
        let total = 10_000_000u64;
        assert!(!seek_within_downloaded(
            total / 10,
            Some(total),
            false,
            300_000,
            600_000
        ));
    }

    #[test]
    fn seek_just_behind_the_frontier_is_allowed() {
        // 下到 120 秒处，跳到 100 秒应当放行（留有余量，不会误判）
        let total = 10_000_000u64;
        let downloaded = total * 120 / 600;
        assert!(seek_within_downloaded(
            downloaded,
            Some(total),
            false,
            100_000,
            600_000
        ));
    }

    #[test]
    fn seek_is_refused_inside_the_safety_margin() {
        // 下到 120 秒处，跳到 119 秒 —— 落在 2 秒余量内，保守拒绝
        let total = 10_000_000u64;
        let downloaded = total * 120 / 600;
        assert!(!seek_within_downloaded(
            downloaded,
            Some(total),
            false,
            119_000,
            600_000
        ));
    }

    #[test]
    fn seek_is_allowed_when_the_frontier_cannot_be_estimated() {
        // 没有 Content-Length：无从判断，放行（保持改动前的行为）
        assert!(seek_within_downloaded(1024, None, false, 300_000, 600_000));
        // 时长未知：同样无法换算
        assert!(seek_within_downloaded(
            1024,
            Some(10_000_000),
            false,
            300_000,
            0
        ));
        // 空文件
        assert!(seek_within_downloaded(0, Some(0), false, 1, 600_000));
    }

    #[test]
    fn seek_to_zero_is_always_allowed_before_completion() {
        // 刚开播时下载量很小，但回到开头不该被挡
        assert!(seek_within_downloaded(
            0,
            Some(10_000_000),
            false,
            0,
            600_000
        ));
    }

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

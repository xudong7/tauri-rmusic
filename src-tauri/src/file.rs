use crate::fs_util::{commit_temp_file, unique_temp_path_for};
use crate::music::MusicFile;
use crate::netease;
use crate::netease::{get_song_cover, get_song_lyric, get_song_url};
use id3::{Tag, TagLike, Version};
use rodio::{Decoder, Source};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, create_dir_all, read_dir, File};
use std::io::{BufReader, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{MetadataOptions, MetadataRevision, StandardTagKey};
use symphonia::core::probe::Hint;
use tauri::AppHandle;
use tauri::Manager;
use tokio::io::AsyncWriteExt;

const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const LIBRARY_INDEX_VERSION: u32 = 4;

#[derive(Serialize, Deserialize)]
struct LibraryIndex {
    version: u32,
    root: String,
    files: Vec<MusicFile>,
    #[serde(default)]
    directories: Vec<DirectorySnapshot>,
}

#[derive(Clone, Serialize, Deserialize)]
struct DirectorySnapshot {
    relative_path: String,
    modified_ms: u64,
    child_directories: Vec<String>,
}

fn supported_audio_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_lowercase();
    ["mp3", "wav", "ogg", "flac"]
        .contains(&extension.as_str())
        .then_some(extension)
}

fn path_key(path: &Path) -> String {
    let mut hasher = Sha1::new();
    hasher.update(path.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn resolve_scan_path(
    path: Option<String>,
    default_directory: Option<String>,
    app_handle: &AppHandle,
) -> Result<PathBuf, String> {
    if let Some(custom_path) = path {
        return Ok(PathBuf::from(custom_path));
    }
    if let Some(default_dir) = default_directory {
        return Ok(Path::new(&default_dir).join("music"));
    }
    get_default_music_dir(app_handle.clone()).map(PathBuf::from)
}

fn library_index_path(app_handle: &AppHandle, scan_path: &Path) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("unable to get app cache dir: {}", e))?
        .join("library-index");
    Ok(dir.join(format!("{}.json", path_key(scan_path))))
}

fn read_library_index(index_path: &Path, scan_path: &Path) -> Vec<MusicFile> {
    read_library_index_value(index_path, scan_path)
        .filter(|index| index.version == 2 || index.version == LIBRARY_INDEX_VERSION)
        .map(|index| index.files)
        .unwrap_or_default()
}

fn read_library_index_value(index_path: &Path, scan_path: &Path) -> Option<LibraryIndex> {
    let Ok(bytes) = fs::read(index_path) else {
        return None;
    };
    let Ok(index) = serde_json::from_slice::<LibraryIndex>(&bytes) else {
        return None;
    };
    if index.root != scan_path.to_string_lossy() {
        return None;
    }
    Some(index)
}

fn read_incremental_library_index(index_path: &Path, scan_path: &Path) -> Option<LibraryIndex> {
    read_library_index_value(index_path, scan_path)
        .filter(|index| index.version == LIBRARY_INDEX_VERSION)
}

fn write_library_index(
    index_path: &Path,
    scan_path: &Path,
    files: &[MusicFile],
    directories: &[DirectorySnapshot],
) -> Result<(), String> {
    if let Some(parent) = index_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create library index dir: {}", e))?;
    }
    let index = LibraryIndex {
        version: LIBRARY_INDEX_VERSION,
        root: scan_path.to_string_lossy().to_string(),
        files: files.to_vec(),
        directories: directories.to_vec(),
    };
    let bytes =
        serde_json::to_vec(&index).map_err(|e| format!("serialize library index: {}", e))?;
    write_bytes_to_file(&bytes, index_path)
}

fn modified_ms(path: &Path) -> u64 {
    path.metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Default)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    duration_ms: u64,
}

/// 标签里的曲序/碟号：常见写法是 "3" 或 "3/12"，取斜杠前的整数
fn parse_tag_number(value: &str) -> Option<u32> {
    value
        .trim()
        .split(['/', '-'])
        .next()?
        .trim()
        .parse::<u32>()
        .ok()
}

fn normalized_tag_value(value: impl ToString) -> Option<String> {
    let value = value.to_string();
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn collect_metadata_revision(revision: &MetadataRevision, metadata: &mut AudioMetadata) {
    for tag in revision.tags() {
        let value = normalized_tag_value(&tag.value);
        match tag.std_key {
            Some(StandardTagKey::TrackTitle) if metadata.title.is_none() => {
                metadata.title = value;
            }
            Some(StandardTagKey::Artist) if metadata.artist.is_none() => {
                metadata.artist = value;
            }
            Some(StandardTagKey::AlbumArtist) if metadata.artist.is_none() => {
                metadata.artist = value;
            }
            Some(StandardTagKey::Album) if metadata.album.is_none() => {
                metadata.album = value;
            }
            Some(StandardTagKey::TrackNumber) if metadata.track_number.is_none() => {
                metadata.track_number = value.as_deref().and_then(parse_tag_number);
            }
            Some(StandardTagKey::DiscNumber) if metadata.disc_number.is_none() => {
                metadata.disc_number = value.as_deref().and_then(parse_tag_number);
            }
            _ => {}
        }
    }
}

fn read_symphonia_metadata(path: &Path, extension: &str) -> Option<AudioMetadata> {
    let source = File::open(path).ok()?;
    let media_source = MediaSourceStream::new(Box::new(source), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(extension);

    let mut probed = symphonia::default::get_probe()
        .format(
            &hint,
            media_source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;
    let mut metadata = AudioMetadata::default();

    if let Some(mut probed_metadata) = probed.metadata.get() {
        if let Some(revision) = probed_metadata.skip_to_latest() {
            collect_metadata_revision(revision, &mut metadata);
        }
    }

    if let Some(track) = probed
        .format
        .default_track()
        .or_else(|| probed.format.tracks().first())
    {
        if let (Some(time_base), Some(frame_count)) =
            (track.codec_params.time_base, track.codec_params.n_frames)
        {
            let time = time_base.calc_time(frame_count);
            metadata.duration_ms = time
                .seconds
                .saturating_mul(1_000)
                .saturating_add((time.frac * 1_000.0).round() as u64);
        }
    }

    if let Some(revision) = probed.format.metadata().skip_to_latest() {
        collect_metadata_revision(revision, &mut metadata);
    }

    Some(metadata)
}

fn read_duration_ms(path: &Path) -> u64 {
    File::open(path)
        .ok()
        .and_then(|file| Decoder::new(BufReader::new(file)).ok())
        .and_then(|decoder| decoder.total_duration())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn read_audio_metadata(path: &Path, extension: &str) -> AudioMetadata {
    let mut metadata = read_symphonia_metadata(path, extension).unwrap_or_default();

    if metadata.duration_ms == 0 {
        metadata.duration_ms = read_duration_ms(path);
    }
    metadata
}

fn rebuild_search_text(file: &mut MusicFile) {
    file.search_text = [
        Some(file.file_name.as_str()),
        file.title.as_deref(),
        file.artist.as_deref(),
        file.album.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
}

fn enrich_music_files(scan_path: &Path, files: &mut [MusicFile], cached_files: &[MusicFile]) {
    let cached_by_path: HashMap<&str, &MusicFile> = cached_files
        .iter()
        .map(|file| (file.relative_path.as_str(), file))
        .collect();

    for file in files {
        if let Some(cached) = cached_by_path.get(file.relative_path.as_str()) {
            if cached.modified_ms == file.modified_ms {
                file.title.clone_from(&cached.title);
                file.artist.clone_from(&cached.artist);
                file.album.clone_from(&cached.album);
                file.track_number = cached.track_number;
                file.disc_number = cached.disc_number;
                file.duration_ms = cached.duration_ms;
                file.search_text.clone_from(&cached.search_text);
                continue;
            }
        }

        let absolute_path = if scan_path.is_file() {
            scan_path.to_path_buf()
        } else {
            scan_path.join(&file.relative_path)
        };
        let metadata = read_audio_metadata(&absolute_path, &file.extension);
        file.title = metadata.title;
        file.artist = metadata.artist;
        file.album = metadata.album;
        file.track_number = metadata.track_number;
        file.disc_number = metadata.disc_number;
        file.duration_ms = metadata.duration_ms;
        rebuild_search_text(file);
    }
}

fn music_file_from_path(id: i32, absolute_path: &Path, relative_path: &Path) -> Option<MusicFile> {
    let file_name = relative_path.to_str()?.to_string();
    let extension = supported_audio_extension(absolute_path)?;
    let search_text = file_name.to_lowercase();

    Some(MusicFile {
        id,
        file_name: file_name.clone(),
        key: path_key(absolute_path),
        relative_path: file_name,
        extension,
        modified_ms: modified_ms(absolute_path),
        search_text,
        title: None,
        artist: None,
        album: None,
        track_number: None,
        disc_number: None,
        duration_ms: 0,
    })
}

/// 这个文件是不是 MP3。
///
/// 守卫是必要的：id3 crate 对无法识别的容器（既不是 ID3 头、也不是 RIFF/WAVE 或
/// AIFF）会**直接在文件开头插一段 ID3**，而 FLAC 必须以 "fLaC" 开头——那样写就是
/// 毁文件。它自己支持 MP3（裸 ID3）、WAV、AIFF 三种，我们只下载 MP3。
fn is_mp3_file(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut head = [0u8; 3];
    if file.read_exact(&mut head).is_err() {
        return false;
    }
    // 已经带 ID3 标签的，或直接以 MPEG 帧同步开头的
    head == *b"ID3" || (head[0] == 0xFF && (head[1] & 0xE0) == 0xE0)
}

/// 把标题 / 歌手 / 专辑写进 MP3 的 ID3 标签。
///
/// 起因：网易云 CDN 给的音频**带 ID3 头、但里面没有任何标签帧**——实测一份 44 首
/// 的曲库只有 1 首能读出标签。于是「歌手 - 歌名」只能从文件名里拆（是在猜），而
/// 专辑名无处可拆，曲库里的专辑列永远是空的。
///
/// 写进文件而不是另存一份 sidecar：标题/歌手/专辑是**所有**软件都关心的信息，
/// 写进去之后访达、手机、别的播放器都看得到，而 sidecar 只有本应用认。封面与歌词
/// 不同——那两样是播放器才关心的，继续走 sidecar。
fn write_id3_tags(path: &Path, title: &str, artist: &str, album: &str) -> Result<(), String> {
    if !is_mp3_file(path) {
        return Err("not an mp3 file, skip ID3 tags".to_string());
    }

    let mut tag = Tag::new();
    // 空字段不写：写进去等于声称「这首歌的专辑就叫空字符串」，而缺字段本身
    // 是有意义的（扫描时会回落到文件名解析）。
    if !title.trim().is_empty() {
        tag.set_title(title.trim());
    }
    if !artist.trim().is_empty() {
        tag.set_artist(artist.trim());
    }
    if !album.trim().is_empty() {
        tag.set_album(album.trim());
    }

    // 写 v2.3 而不是 crate 默认的 v2.4：兼容面更广（Windows 资源管理器、
    // 老播放器都认 v2.3），而源文件本身也是 v2.3。
    tag.write_to_path(path, Version::Id3v23)
        .map_err(|e| format!("write id3 tags: {}", e))
}

async fn write_response_to_file(
    mut response: reqwest::Response,
    target_path: &Path,
) -> Result<(), String> {
    let tmp_path = unique_temp_path_for(target_path);

    let result: Result<(), String> = async {
        let mut file = tokio::fs::File::create(&tmp_path)
            .await
            .map_err(|e| format!("create temp file error: {}", e))?;
        while let Some(chunk) = tokio::time::timeout(STREAM_IDLE_TIMEOUT, response.chunk())
            .await
            .map_err(|_| format!("download stalled for {}s", STREAM_IDLE_TIMEOUT.as_secs()))?
            .map_err(|e| format!("read bytes data error: {}", e))?
        {
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("write error: {}", e))?;
        }
        file.flush()
            .await
            .map_err(|e| format!("flush error: {}", e))?;
        drop(file);

        tokio::fs::hard_link(&tmp_path, target_path)
            .await
            .map_err(|e| {
                if e.kind() == ErrorKind::AlreadyExists {
                    format!("file already exists: {}", target_path.display())
                } else {
                    format!("commit file error: {}", e)
                }
            })?;
        tokio::fs::remove_file(&tmp_path)
            .await
            .map_err(|e| format!("remove temp file error: {}", e))?;
        Ok(())
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&tmp_path).await;
    }

    result
}

fn available_import_path(target_path: &Path) -> PathBuf {
    if !target_path.exists() {
        return target_path.to_path_buf();
    }

    let parent = target_path.parent().unwrap_or_else(|| Path::new(""));
    let stem = target_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("imported");
    let extension = target_path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");

    for counter in 1.. {
        let file_name = if extension.is_empty() {
            format!("{}_{}", stem, counter)
        } else {
            format!("{}_{}.{}", stem, counter, extension)
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("unbounded counter should eventually find an available import path")
}

fn commit_new_temp_file(tmp_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::hard_link(tmp_path, target_path).map_err(|e| {
        if e.kind() == ErrorKind::AlreadyExists {
            format!("file already exists: {}", target_path.display())
        } else {
            format!("commit file error: {}", e)
        }
    })?;
    fs::remove_file(tmp_path).map_err(|e| format!("remove temp file error: {}", e))
}

fn write_bytes_to_file(bytes: &[u8], target_path: &Path) -> Result<(), String> {
    let tmp_path = unique_temp_path_for(target_path);

    let result: Result<(), String> = (|| {
        let mut file =
            File::create(&tmp_path).map_err(|e| format!("create temp file error: {}", e))?;
        file.write_all(bytes)
            .map_err(|e| format!("write file error: {}", e))?;
        file.flush()
            .map_err(|e| format!("flush file error: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("sync file error: {}", e))?;
        drop(file);
        commit_temp_file(&tmp_path, target_path)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }

    result
}

fn copy_file_to_path(source_path: &Path, target_path: &Path) -> Result<(), String> {
    let tmp_path = unique_temp_path_for(target_path);

    let result: Result<(), String> = (|| {
        fs::copy(source_path, &tmp_path)
            .map_err(|e| format!("copy file to temp error {}: {}", source_path.display(), e))?;

        commit_new_temp_file(&tmp_path, target_path)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }

    result
}

#[cfg(test)]
pub fn scan_directory(
    base_path: &std::path::Path,
    dir_path: &std::path::Path,
    files: &mut Vec<MusicFile>,
    id: &mut i32,
) {
    if let Ok(entries) = read_dir(dir_path) {
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            let is_hidden = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.'));
            if is_hidden {
                continue;
            }

            if file_type.is_dir() {
                scan_directory(base_path, &path, files, id);
            } else if file_type.is_file() && supported_audio_extension(&path).is_some() {
                if let Ok(relative) = path.strip_prefix(base_path) {
                    if let Some(file) = music_file_from_path(*id, &path, relative) {
                        files.push(file);
                        *id += 1;
                    }
                }
            }
        }
    }
}

fn relative_path_string(base_path: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(base_path).ok()?;
    if relative.as_os_str().is_empty() {
        Some(String::new())
    } else {
        relative.to_str().map(ToOwned::to_owned)
    }
}

fn parent_relative_path(relative_path: &str) -> String {
    Path::new(relative_path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .and_then(Path::to_str)
        .unwrap_or("")
        .to_string()
}

fn scan_directory_incremental(
    base_path: &Path,
    dir_path: &Path,
    cached_directories: &HashMap<String, DirectorySnapshot>,
    cached_files_by_parent: &HashMap<String, Vec<MusicFile>>,
    files: &mut Vec<MusicFile>,
    directories: &mut Vec<DirectorySnapshot>,
) -> bool {
    let Ok(metadata) = fs::symlink_metadata(dir_path) else {
        return false;
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return false;
    }

    let Some(relative_path) = relative_path_string(base_path, dir_path) else {
        return false;
    };
    let current_modified_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let cached_directory = cached_directories.get(&relative_path);
    let can_reuse_listing =
        cached_directory.is_some_and(|cached| cached.modified_ms == current_modified_ms);
    let mut child_directories = Vec::new();

    if can_reuse_listing {
        if let Some(cached_files) = cached_files_by_parent.get(&relative_path) {
            for cached_file in cached_files {
                let absolute_path = base_path.join(&cached_file.relative_path);
                let Ok(file_metadata) = fs::symlink_metadata(&absolute_path) else {
                    continue;
                };
                if !file_metadata.is_file() || file_metadata.file_type().is_symlink() {
                    continue;
                }
                let relative = Path::new(&cached_file.relative_path);
                if let Some(file) = music_file_from_path(0, &absolute_path, relative) {
                    files.push(file);
                }
            }
        }

        if let Some(cached) = cached_directory {
            for child_relative in &cached.child_directories {
                let child_path = base_path.join(child_relative);
                if scan_directory_incremental(
                    base_path,
                    &child_path,
                    cached_directories,
                    cached_files_by_parent,
                    files,
                    directories,
                ) {
                    child_directories.push(child_relative.clone());
                }
            }
        }
    } else if let Ok(entries) = read_dir(dir_path) {
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            let is_hidden = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.'));
            if is_hidden {
                continue;
            }

            if file_type.is_dir() {
                let Some(child_relative) = relative_path_string(base_path, &path) else {
                    continue;
                };
                if scan_directory_incremental(
                    base_path,
                    &path,
                    cached_directories,
                    cached_files_by_parent,
                    files,
                    directories,
                ) {
                    child_directories.push(child_relative);
                }
            } else if file_type.is_file() && supported_audio_extension(&path).is_some() {
                if let Ok(relative) = path.strip_prefix(base_path) {
                    if let Some(file) = music_file_from_path(0, &path, relative) {
                        files.push(file);
                    }
                }
            }
        }
    }

    directories.push(DirectorySnapshot {
        relative_path,
        modified_ms: current_modified_ms,
        child_directories,
    });
    true
}

fn scan_files_incremental(
    scan_path: &Path,
    cached_index: Option<&LibraryIndex>,
) -> (Vec<MusicFile>, Vec<DirectorySnapshot>) {
    let cached_directories: HashMap<String, DirectorySnapshot> = cached_index
        .map(|index| {
            index
                .directories
                .iter()
                .cloned()
                .map(|directory| (directory.relative_path.clone(), directory))
                .collect()
        })
        .unwrap_or_default();
    let mut cached_files_by_parent: HashMap<String, Vec<MusicFile>> = HashMap::new();
    if let Some(index) = cached_index {
        for file in &index.files {
            cached_files_by_parent
                .entry(parent_relative_path(&file.relative_path))
                .or_default()
                .push(file.clone());
        }
    }

    let mut music_files = Vec::new();
    let mut directories = Vec::new();
    if scan_path.is_dir() {
        scan_directory_incremental(
            scan_path,
            scan_path,
            &cached_directories,
            &cached_files_by_parent,
            &mut music_files,
            &mut directories,
        );
        music_files.sort_by(|a, b| a.file_name.cmp(&b.file_name));
        for (index, file) in music_files.iter_mut().enumerate() {
            file.id = index as i32;
        }
    } else if supported_audio_extension(scan_path).is_some() {
        if let Some(file_name) = scan_path.file_name() {
            if let Some(file) = music_file_from_path(0, scan_path, Path::new(file_name)) {
                music_files.push(file);
            }
        }
    }
    (music_files, directories)
}

#[tauri::command]
pub async fn load_cached_music_files(
    path: Option<String>,
    default_directory: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<MusicFile>, String> {
    let scan_path = resolve_scan_path(path, default_directory, &app_handle)?;
    let index_path = library_index_path(&app_handle, &scan_path)?;
    tokio::task::spawn_blocking(move || read_library_index(&index_path, &scan_path))
        .await
        .map_err(|e| format!("load library index task failed: {}", e))
}

#[tauri::command]
pub async fn scan_files(
    path: Option<String>,
    default_directory: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<MusicFile>, String> {
    let scan_path = resolve_scan_path(path, default_directory, &app_handle)?;
    let index_path = library_index_path(&app_handle, &scan_path)?;
    tokio::task::spawn_blocking(move || {
        let cached_index = read_incremental_library_index(&index_path, &scan_path);
        let cached_files = cached_index
            .as_ref()
            .map(|index| index.files.clone())
            .unwrap_or_default();
        let (mut files, directories) = scan_files_incremental(&scan_path, cached_index.as_ref());
        enrich_music_files(&scan_path, &mut files, &cached_files);
        if let Err(error) = write_library_index(&index_path, &scan_path, &files, &directories) {
            eprintln!("write library index failed: {}", error);
        }
        files
    })
    .await
    .map_err(|e| format!("scan library task failed: {}", e))
}

/// get default music directory
#[tauri::command]
pub fn get_default_music_dir(app_handle: AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("unable to get dir: {}", e))?;

    let music_dir = app_dir.join("music");

    if !music_dir.exists() {
        create_dir_all(&music_dir).map_err(|e| format!("create default dir error: {}", e))?;
    }

    music_dir
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "path trans error".to_string())
}

/// download the music into the default music folder
#[tauri::command]
pub async fn download_music(
    app_handle: AppHandle,
    song_hash: String,
    song_name: String,
    artist: String,
    album: String,
    default_directory: Option<String>,
) -> Result<String, String> {
    let song_url = get_song_url(song_hash.clone()).await?;

    let client = netease::get_client()?;

    let response = netease::get_response(client.clone(), song_url).await?;

    let base_dir = if let Some(custom_dir) = default_directory {
        std::path::PathBuf::from(custom_dir)
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("unable to get dir: {}", e))?
    };

    let music_dir = base_dir.join("music");
    let cover_dir = base_dir.join("cover");
    let lyrics_dir = base_dir.join("lyrics");

    if !music_dir.exists() {
        create_dir_all(&music_dir).map_err(|e| format!("create music dir error: {}", e))?;
    }

    if !cover_dir.exists() {
        create_dir_all(&cover_dir).map_err(|e| format!("create cover dir error: {}", e))?;
    }

    if !lyrics_dir.exists() {
        create_dir_all(&lyrics_dir).map_err(|e| format!("create lyrics dir error: {}", e))?;
    }

    let file_name = format!(
        "{} - {}.mp3",
        sanitize_filename(&artist),
        sanitize_filename(&song_name)
    );
    let file_path = music_dir.join(&file_name);

    if file_path.exists() {
        return Err(format!("file already exists: {}", file_path.display()));
    }
    write_response_to_file(response, &file_path).await?;
    // 标签是锦上添花：写不进去不该让整次下载失败（音频本身是好的）。与封面/歌词
    // 一样按「尽力而为」处理，区别只是这里失败会留下日志——写不进去通常意味着
    // 代理给的不是 MP3，那是值得知道的。
    if let Err(e) = write_id3_tags(&file_path, &song_name, &artist, &album) {
        eprintln!("write id3 tags failed: {}", e);
    }
    let base_filename = file_name.replace(".mp3", "");

    let cover_url_result =
        get_song_cover(song_hash.clone(), song_name.clone(), artist.clone()).await;
    if let Ok(cover_url) = cover_url_result {
        if !cover_url.is_empty() {
            match netease::get_response(client.clone(), cover_url).await {
                Ok(pic_response) => {
                    if let Ok(Ok(pic_bytes)) =
                        tokio::time::timeout(STREAM_IDLE_TIMEOUT, pic_response.bytes()).await
                    {
                        let cover_path = cover_dir.join(format!("{}.jpg", base_filename));
                        if let Err(e) = write_bytes_to_file(&pic_bytes, &cover_path) {
                            eprintln!("write cover failed: {}", e);
                        }
                    }
                }
                Err(e) => eprintln!("download cover failed: {}", e),
            }
        }
    }

    match get_song_lyric(song_hash.clone()).await {
        Ok(lyric_result) => {
            // 本地歌词文件只存原文：翻译是显示层的事，写进 .lrc 反而破坏时间轴
            if !lyric_result.lyric.is_empty() {
                let lyric_path = lyrics_dir.join(format!("{}.lrc", base_filename));
                if let Err(e) = write_bytes_to_file(lyric_result.lyric.as_bytes(), &lyric_path) {
                    eprintln!("write lyric failed: {}", e);
                }
            }
        }
        Err(e) => eprintln!("download lyric failed: {}", e),
    }

    Ok(file_name)
}

fn local_media_base_dir(
    app_handle: &AppHandle,
    default_directory: Option<String>,
) -> Result<PathBuf, String> {
    if let Some(custom_dir) = default_directory {
        Ok(PathBuf::from(custom_dir))
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("unable to get app data dir: {}", e))
    }
}

fn sidecar_stem(file_name: &str) -> String {
    let path = Path::new(file_name);
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty());
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);

    if let Some(parent) = parent {
        parent.join(stem).to_string_lossy().to_string()
    } else {
        stem.to_string()
    }
}

/// load local cover path for direct asset protocol rendering
#[tauri::command]
pub fn load_local_cover_path(
    app_handle: AppHandle,
    file_name: String,
    default_directory: Option<String>,
) -> Result<Option<String>, String> {
    let base_dir = local_media_base_dir(&app_handle, default_directory)?;
    let stem = sidecar_stem(&file_name);

    for ext in ["jpg", "jpeg", "png", "webp"] {
        let path = base_dir.join("cover").join(format!("{}.{}", stem, ext));
        if path.exists() {
            app_handle
                .asset_protocol_scope()
                .allow_file(&path)
                .map_err(|e| format!("allow cover asset path error: {}", e))?;
            return path
                .to_str()
                .map(|path| Some(path.to_string()))
                .ok_or_else(|| "cover path trans error".to_string());
        }
    }

    Ok(None)
}

/// load local lyric text without transferring cover bytes
#[tauri::command]
pub fn load_local_lyric(
    app_handle: AppHandle,
    file_name: String,
    default_directory: Option<String>,
) -> Result<String, String> {
    let base_dir = local_media_base_dir(&app_handle, default_directory)?;
    let lyrics_path = base_dir
        .join("lyrics")
        .join(format!("{}.lrc", sidecar_stem(&file_name)));

    if !lyrics_path.exists() {
        return Ok(String::new());
    }

    std::fs::read_to_string(&lyrics_path).map_err(|e| format!("read lyric file failed: {}", e))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

fn music_dir_from_library_root(root_dir: &Path) -> PathBuf {
    root_dir.join("music")
}

/// 从曲库里删掉一首歌：音频文件，连同它的封面与歌词旁挂文件。
///
/// 这是**唯一**会删用户文件的命令，所以两处都要紧：
///
/// - `file_name` 来自前端，必须挡住路径穿越。只接受相对路径且每一段都是普通
///   名字（`Album/song.mp3` 可以，`../x`、`/etc/passwd` 一律拒绝），拼出来之后
///   再确认一次结果仍在 music 目录里。
/// - 只删本应用自己写的那三样，不递归、不碰别的。曲库里的东西都是应用管的：
///   下载是写进去的新文件，导入是**复制**进来的副本，删掉都不会动用户的原件。
///
/// 旁挂文件一起删，否则每删一首就留下两份孤儿（cover/ 与 lyrics/）。
#[tauri::command]
pub fn delete_music_file(
    app_handle: AppHandle,
    file_name: String,
    default_directory: Option<String>,
) -> Result<(), String> {
    let base_dir = if let Some(custom_dir) = default_directory {
        PathBuf::from(custom_dir)
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("unable to get app data dir: {}", e))?
    };
    delete_music_at(&base_dir, &file_name)
}

/// 删除的实际逻辑。与命令分开只为可测：命令要 AppHandle，测试构造不出来。
fn delete_music_at(base_dir: &Path, file_name: &str) -> Result<(), String> {
    let music_dir = music_dir_from_library_root(base_dir);

    if !is_safe_library_relative_path(file_name) {
        return Err(format!(
            "refuse to delete outside the library: {}",
            file_name
        ));
    }
    let target = music_dir.join(file_name);
    if !target.starts_with(&music_dir) {
        return Err(format!(
            "refuse to delete outside the library: {}",
            file_name
        ));
    }
    if !target.is_file() {
        return Err(format!("file not found: {}", target.display()));
    }

    fs::remove_file(&target).map_err(|e| format!("delete file error: {}", e))?;

    // 旁挂文件是尽力而为：删不掉也不该让「音频已经删了」这件事报成失败。
    let stem = sidecar_stem(file_name);
    let _ = fs::remove_file(base_dir.join("lyrics").join(format!("{}.lrc", stem)));
    for ext in ["jpg", "jpeg", "png", "webp"] {
        let _ = fs::remove_file(base_dir.join("cover").join(format!("{}.{}", stem, ext)));
    }

    Ok(())
}

/// 这个字符串能不能安全地当作「曲库内的相对路径」。
///
/// 只允许普通名字组成的相对路径：拒绝绝对路径与任何 `..`（根、父目录、前缀）。
/// 曲库确实会有子目录（`Album/song.mp3`），所以不能一刀切成「只许纯文件名」。
fn is_safe_library_relative_path(file_name: &str) -> bool {
    let path = Path::new(file_name);
    !file_name.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_)))
}

/// import music files from a directory into the default music directory
#[tauri::command]
pub async fn import_music(
    app_handle: AppHandle,
    files: Vec<String>,
    default_directory: Option<String>,
) -> Result<String, String> {
    // 获取库根目录；音乐文件统一导入到 root/music，与下载/扫描路径保持一致。
    let base_dir = if let Some(custom_dir) = default_directory {
        PathBuf::from(custom_dir)
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("unable to get app data dir: {}", e))?
    };
    let music_dir = music_dir_from_library_root(&base_dir);

    // 拷贝整个目录可能持续数分钟，必须离开主线程：非 async 的 command 由 Tauri
    // 在 webview 的 IPC 回调里内联执行，期间事件循环不转——窗口不重绘、拖不动，
    // Windows 上会直接显示"未响应"。scan_files / load_cached_music_files 都走了
    // spawn_blocking，只有这里漏了。
    tokio::task::spawn_blocking(move || import_music_blocking(&music_dir, files))
        .await
        .map_err(|e| format!("import music task failed: {}", e))?
}

fn import_music_blocking(music_dir: &Path, files: Vec<String>) -> Result<String, String> {
    create_dir_all(music_dir).map_err(|e| format!("create music dir error: {}", e))?;

    let mut imported_count = 0;
    let mut failed_files = Vec::new();

    for file_path in files {
        let source_path = PathBuf::from(&file_path);

        if !source_path.is_file() {
            failed_files.push(format!("文件不存在或不是普通文件: {}", file_path));
            continue;
        }

        if supported_audio_extension(&source_path).is_none() {
            failed_files.push(format!("不支持的格式: {}", file_path));
            continue;
        }

        if let Some(file_name) = source_path.file_name() {
            let target_path = music_dir.join(file_name);
            let target_path = available_import_path(&target_path);

            match copy_file_to_path(&source_path, &target_path) {
                Ok(_) => {
                    imported_count += 1;
                }
                Err(e) => {
                    failed_files.push(format!("复制文件失败 {}: {}", file_path, e));
                }
            }
        } else {
            failed_files.push(format!("无法获取文件名: {}", file_path));
        }
    }

    let mut result_message = format!("成功导入 {} 个文件", imported_count);

    if !failed_files.is_empty() {
        result_message.push_str(&format!("\n失败的文件 ({}):", failed_files.len()));
        for failed in failed_files {
            result_message.push_str(&format!("\n- {}", failed));
        }
    }

    Ok(result_message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_dir(prefix: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-{}-{}-{}",
            prefix,
            std::process::id(),
            unique
        ));
        create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn sanitize_filename_replaces_filesystem_reserved_chars() {
        assert_eq!(
            sanitize_filename(r#"a\b/c:d*e?f"g<h>i|j"#),
            "a_b_c_d_e_f_g_h_i_j"
        );
    }

    #[test]
    fn unique_temp_path_stays_next_to_download_target() {
        let target = Path::new("/tmp/rmusic-library/music/Artist - Song.mp3");
        let tmp = unique_temp_path_for(target);

        assert_eq!(tmp.parent(), target.parent());
        assert_ne!(tmp, target);
        assert!(tmp
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("Artist - Song.mp3.") && name.ends_with(".tmp")));
    }

    #[test]
    fn available_import_path_appends_counter_when_target_exists() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-import-name-test-{}-{}",
            std::process::id(),
            unique
        ));
        create_dir_all(&root).unwrap();
        fs::write(root.join("song.mp3"), b"audio").unwrap();
        fs::write(root.join("song_1.mp3"), b"audio").unwrap();

        assert_eq!(
            available_import_path(&root.join("song.mp3")),
            root.join("song_2.mp3")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn copy_file_to_path_commits_without_temp_artifact() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-import-copy-test-{}-{}",
            std::process::id(),
            unique
        ));
        create_dir_all(&root).unwrap();
        let source = root.join("source.mp3");
        let target = root.join("target.mp3");
        fs::write(&source, b"audio").unwrap();

        copy_file_to_path(&source, &target).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"audio");
        assert!(fs::read_dir(&root).unwrap().flatten().all(|entry| entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            != Some("tmp")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn commit_new_temp_file_never_replaces_an_existing_target() {
        let root = unique_test_dir("commit-new-file");
        let tmp_path = root.join("song.tmp");
        let target_path = root.join("song.mp3");
        fs::write(&tmp_path, b"new audio").unwrap();
        fs::write(&target_path, b"existing audio").unwrap();

        assert!(commit_new_temp_file(&tmp_path, &target_path).is_err());
        assert_eq!(fs::read(&target_path).unwrap(), b"existing audio");
        assert!(tmp_path.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_bytes_to_file_replaces_target_without_temp_artifact() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-sidecar-write-test-{}-{}",
            std::process::id(),
            unique
        ));
        create_dir_all(&root).unwrap();
        let target = root.join("cover.jpg");
        fs::write(&target, b"old").unwrap();

        write_bytes_to_file(b"new-cover", &target).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new-cover");
        assert!(fs::read_dir(&root).unwrap().flatten().all(|entry| entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            != Some("tmp")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn supported_audio_extension_is_case_insensitive() {
        assert_eq!(
            supported_audio_extension(Path::new("song.MP3")),
            Some("mp3".into())
        );
        assert_eq!(
            supported_audio_extension(Path::new("album/track.FlAc")),
            Some("flac".into())
        );
        assert_eq!(supported_audio_extension(Path::new("cover.jpg")), None);
    }

    #[test]
    fn scan_directory_skips_hidden_and_unsupported_files() {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-scan-test-{}-{}",
            std::process::id(),
            unique
        ));
        let album_dir = root.join("Album");
        let hidden_dir = root.join(".hidden");
        create_dir_all(&album_dir).unwrap();
        create_dir_all(&hidden_dir).unwrap();
        fs::write(album_dir.join("a.FLAC"), b"audio").unwrap();
        fs::write(root.join("b.mp3"), b"audio").unwrap();
        fs::write(root.join("notes.txt"), b"text").unwrap();
        fs::write(hidden_dir.join("hidden.mp3"), b"audio").unwrap();

        let mut files = Vec::new();
        let mut id = 0;
        scan_directory(&root, &root, &mut files, &mut id);

        let names: Vec<_> = files.iter().map(|file| file.file_name.clone()).collect();
        assert_eq!(
            names,
            vec![
                Path::new("Album")
                    .join("a.FLAC")
                    .to_string_lossy()
                    .to_string(),
                "b.mp3".to_string(),
            ]
        );
        assert_eq!(files[0].extension, "flac");
        assert_eq!(files[1].extension, "mp3");
        assert_eq!(id, 2);

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn scan_directory_skips_symlink_directories() {
        use std::os::unix::fs::symlink;

        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rmusic-symlink-scan-test-{}-{}",
            std::process::id(),
            unique
        ));
        let real_dir = root.join("real");
        create_dir_all(&real_dir).unwrap();
        fs::write(real_dir.join("song.mp3"), b"audio").unwrap();
        symlink(&root, root.join("loop")).unwrap();

        let mut files = Vec::new();
        let mut id = 0;
        scan_directory(&root, &root, &mut files, &mut id);

        let names: Vec<_> = files.iter().map(|file| file.file_name.clone()).collect();
        assert_eq!(
            names,
            vec![Path::new("real")
                .join("song.mp3")
                .to_string_lossy()
                .to_string()]
        );
        assert_eq!(id, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sidecar_stem_removes_extension_for_plain_file_name() {
        assert_eq!(sidecar_stem("Artist - Song.mp3"), "Artist - Song");
    }

    #[test]
    fn sidecar_stem_preserves_relative_parent_directory() {
        assert_eq!(
            sidecar_stem("Album/Artist - Song.flac"),
            Path::new("Album")
                .join("Artist - Song")
                .to_string_lossy()
                .to_string()
        );
    }

    #[test]
    fn music_dir_from_library_root_appends_music_subdirectory() {
        assert_eq!(
            music_dir_from_library_root(Path::new("/tmp/rmusic-library")),
            Path::new("/tmp/rmusic-library").join("music")
        );
    }

    /// 造一个假 MP3：ID3v2.3 的空标签头（10 字节）+ 一段假的音频数据。
    /// 真实下载回来的文件就是这个样子——有 ID3 头、里面没有标签帧。
    fn fake_mp3_with_empty_id3() -> Vec<u8> {
        let mut bytes = b"ID3\x03\x00\x00\x00\x00\x00\x00".to_vec();
        bytes.resize(bytes.len() + 64, 0xAA);
        bytes
    }

    /// 拿一个**真实的**下载文件验证：写完之后连 macOS 的 Spotlight 都能读到。
    ///
    /// 与 netease.rs 里那些对着 sidecar 跑的测试同规矩：需要外部资源，默认 ignore。
    /// 用法：
    ///   RMUSIC_TEST_MP3=/path/to/real.mp3 cargo test -- --ignored real_download_can_be_tagged
    #[test]
    #[ignore]
    fn real_download_can_be_tagged() {
        let Ok(path) = std::env::var("RMUSIC_TEST_MP3") else {
            panic!("需要 RMUSIC_TEST_MP3 指向一个真实的下载文件");
        };
        let path = PathBuf::from(path);

        assert!(is_mp3_file(&path), "真实下载文件应当被认作 MP3");
        write_id3_tags(&path, "Tagged Title", "Tagged Artist", "Tagged Album").unwrap();

        let tag = Tag::read_from_path(&path).unwrap();
        assert_eq!(tag.title(), Some("Tagged Title"));
        assert_eq!(tag.artist(), Some("Tagged Artist"));
        assert_eq!(tag.album(), Some("Tagged Album"));
    }

    #[test]
    fn recognizes_mp3_but_not_other_containers() {
        let dir = unique_test_dir("id3-guard");

        let with_id3 = dir.join("a.mp3");
        std::fs::write(&with_id3, fake_mp3_with_empty_id3()).unwrap();
        assert!(is_mp3_file(&with_id3), "带 ID3 头的应认作 MP3");

        // 没有标签、直接以 MPEG 帧同步开头
        let raw = dir.join("b.mp3");
        std::fs::write(&raw, [0xFFu8, 0xFB, 0x90, 0x00, 0x11, 0x22]).unwrap();
        assert!(is_mp3_file(&raw), "帧同步开头的应认作 MP3");

        // 这几种绝不能写 ID3：往 FLAC 开头插一段标签会毁掉文件
        for (name, head) in [
            ("c.flac", b"fLaC\x00\x00\x00\x22".to_vec()),
            ("d.wav", b"RIFF\x24\x08\x00\x00WAVE".to_vec()),
            ("e.ogg", b"OggS\x00\x02\x00\x00".to_vec()),
        ] {
            let path = dir.join(name);
            std::fs::write(&path, &head).unwrap();
            assert!(!is_mp3_file(&path), "{name} 不该被认作 MP3");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_and_reads_back_the_tags() {
        let dir = unique_test_dir("id3-write");
        let path = dir.join("a.mp3");
        std::fs::write(&path, fake_mp3_with_empty_id3()).unwrap();

        write_id3_tags(&path, "My jealousy", "DJMAX", "DJMAX RESPECT V").unwrap();

        let tag = Tag::read_from_path(&path).unwrap();
        assert_eq!(tag.title(), Some("My jealousy"));
        assert_eq!(tag.artist(), Some("DJMAX"));
        assert_eq!(tag.album(), Some("DJMAX RESPECT V"));

        // 音频数据必须原样留着——写标签只该替换文件开头那一小段
        let after = std::fs::read(&path).unwrap();
        assert!(after.ends_with(&[0xAAu8; 64]), "写入标签后音频内容不能变");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_to_write_tags_onto_a_non_mp3() {
        let dir = unique_test_dir("id3-refuse");
        let path = dir.join("a.flac");
        let original = b"fLaC\x00\x00\x00\x22tune".to_vec();
        std::fs::write(&path, &original).unwrap();

        assert!(write_id3_tags(&path, "T", "A", "Al").is_err());
        assert_eq!(
            std::fs::read(&path).unwrap(),
            original,
            "拒绝之后文件必须一个字节都没动"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_fields_are_left_unset() {
        let dir = unique_test_dir("id3-empty");
        let path = dir.join("a.mp3");
        std::fs::write(&path, fake_mp3_with_empty_id3()).unwrap();

        // 专辑缺失时（本地歌或接口没给）不该写一个空字符串进去，
        // 缺字段本身有意义——扫描时会回落到文件名解析。
        write_id3_tags(&path, "Title", "Artist", "   ").unwrap();

        let tag = Tag::read_from_path(&path).unwrap();
        assert_eq!(tag.title(), Some("Title"));
        assert_eq!(tag.album(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 删文件是唯一会动用户数据的命令，路径判定必须严。
    /// 曲库确实有子目录（扫描子目录时 relative_path 带一段父目录），所以不能
    /// 一刀切成「只许纯文件名」——但 `..` 与绝对路径必须挡住。
    #[test]
    fn library_relative_path_guard() {
        for ok in [
            "Artist - Song.mp3",
            "Album/Artist - Song.mp3",
            "a/b/c.flac",
            "名字 带空格.mp3",
        ] {
            assert!(is_safe_library_relative_path(ok), "{ok} 应当放行");
        }

        for bad in [
            "",
            "..",
            "../outside.mp3",
            "../../etc/passwd",
            "Album/../../outside.mp3",
            "/etc/passwd",
            "Album/../Album/song.mp3",
        ] {
            assert!(!is_safe_library_relative_path(bad), "{bad} 必须拒绝");
        }
    }

    /// 端到端：删掉音频，同时把它的封面与歌词一起带走，别的文件不动。
    #[test]
    fn delete_removes_audio_and_its_sidecars_only() {
        let root = unique_test_dir("delete-music");
        let music = root.join("music");
        let cover = root.join("cover");
        let lyrics = root.join("lyrics");
        create_dir_all(&music).unwrap();
        create_dir_all(&cover).unwrap();
        create_dir_all(&lyrics).unwrap();

        let victim = music.join("Artist - Song.mp3");
        let bystander = music.join("Other - Track.mp3");
        fs::write(&victim, b"audio").unwrap();
        fs::write(&bystander, b"audio").unwrap();
        fs::write(cover.join("Artist - Song.jpg"), b"pic").unwrap();
        fs::write(lyrics.join("Artist - Song.lrc"), b"lrc").unwrap();
        fs::write(cover.join("Other - Track.jpg"), b"pic").unwrap();

        delete_music_at(&root, "Artist - Song.mp3").unwrap();

        assert!(!victim.exists(), "音频该删掉");
        assert!(!cover.join("Artist - Song.jpg").exists(), "封面该一起走");
        assert!(!lyrics.join("Artist - Song.lrc").exists(), "歌词该一起走");
        assert!(bystander.exists(), "别的歌不能动");
        assert!(cover.join("Other - Track.jpg").exists(), "别的封面不能动");

        // 再删一次：文件已经不在了，应当报错而不是静默成功
        assert!(delete_music_at(&root, "Artist - Song.mp3").is_err());

        let _ = fs::remove_dir_all(&root);
    }

    /// 路径穿越必须被挡住，且**目录外那个文件一个字节都不能动**。
    #[test]
    fn delete_refuses_to_touch_files_outside_the_library() {
        let root = unique_test_dir("delete-guard");
        let music = root.join("music");
        create_dir_all(&music).unwrap();

        let outside = root.join("outside.mp3");
        fs::write(&outside, b"precious").unwrap();

        assert!(delete_music_at(&root, "../outside.mp3").is_err());
        assert!(delete_music_at(&root, "/etc/hosts").is_err());

        assert_eq!(
            fs::read(&outside).unwrap(),
            b"precious",
            "库外的文件必须一个字节都没动"
        );

        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod tag_number_tests {
    use super::parse_tag_number;

    #[test]
    fn parses_plain_and_slashed_track_numbers() {
        assert_eq!(parse_tag_number("3"), Some(3));
        assert_eq!(parse_tag_number("3/12"), Some(3));
        assert_eq!(parse_tag_number(" 2 "), Some(2));
        assert_eq!(parse_tag_number("1-10"), Some(1));
        assert_eq!(parse_tag_number(""), None);
        assert_eq!(parse_tag_number("abc"), None);
    }
}

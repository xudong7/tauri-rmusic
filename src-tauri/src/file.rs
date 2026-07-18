use crate::music::MusicFile;
use crate::netease;
use crate::netease::get_song_url;
use rodio::{Decoder, Source};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, create_dir_all, read_dir, File};
use std::io::{BufReader, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{MetadataOptions, MetadataRevision, StandardTagKey};
use symphonia::core::probe::Hint;
use tauri::AppHandle;
use tauri::Manager;
use tokio::io::AsyncWriteExt;

const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const LIBRARY_INDEX_VERSION: u32 = 3;

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
    duration_ms: u64,
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
        duration_ms: 0,
    })
}

fn unique_temp_path_for(target_path: &Path) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");

    target_path.with_file_name(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        unique
    ))
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

fn commit_temp_file(tmp_path: &Path, target_path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    if target_path.exists() {
        fs::remove_file(target_path).map_err(|e| format!("replace file: {}", e))?;
    }

    fs::rename(tmp_path, target_path).map_err(|e| format!("commit file error: {}", e))
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

/// recursive scan the directory
/// and add the files to the list
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
    default_directory: Option<String>,
) -> Result<String, String> {
    // 获取歌曲下载URL
    let song_url = get_song_url(song_hash.clone()).await?;

    let client = netease::get_client()?;

    // 下载歌曲文件
    let response = netease::get_response(client.clone(), song_url).await?;

    // Determine the base directory to use
    let base_dir = if let Some(custom_dir) = default_directory {
        // Use the custom directory as base, create subdirectories within it
        std::path::PathBuf::from(custom_dir)
    } else {
        // Fall back to app data directory
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("unable to get dir: {}", e))?
    };

    // Create subdirectories under the base directory
    let music_dir = base_dir.join("music");
    let cover_dir = base_dir.join("cover");
    let lyrics_dir = base_dir.join("lyrics");

    // Create directories if they don't exist
    if !music_dir.exists() {
        create_dir_all(&music_dir).map_err(|e| format!("create music dir error: {}", e))?;
    }

    if !cover_dir.exists() {
        create_dir_all(&cover_dir).map_err(|e| format!("create cover dir error: {}", e))?;
    }

    if !lyrics_dir.exists() {
        create_dir_all(&lyrics_dir).map_err(|e| format!("create lyrics dir error: {}", e))?;
    }

    // create file name
    let file_name = format!(
        "{} - {}.mp3",
        sanitize_filename(&artist),
        sanitize_filename(&song_name)
    );
    let file_path = music_dir.join(&file_name);

    // check if the file exists
    if file_path.exists() {
        return Err(format!("file already exists: {}", file_path.display()));
    }
    write_response_to_file(response, &file_path).await?;
    // 下载封面图片
    let base_filename = file_name.replace(".mp3", "");

    use crate::netease::get_song_cover;

    let cover_url_result =
        get_song_cover(song_hash.clone(), song_name.clone(), artist.clone()).await;
    if let Ok(cover_url) = cover_url_result {
        if !cover_url.is_empty() {
            // 2. 下载封面图片
            match netease::get_response(client.clone(), cover_url).await {
                Ok(pic_response) => {
                    if let Ok(Ok(pic_bytes)) =
                        tokio::time::timeout(STREAM_IDLE_TIMEOUT, pic_response.bytes()).await
                    {
                        let cover_path = cover_dir.join(format!("{}.jpg", base_filename));
                        if let Err(e) = write_bytes_to_file(&pic_bytes, &cover_path) {
                            eprintln!("写入封面失败: {}", e);
                        }
                    }
                }
                Err(e) => eprintln!("下载封面失败: {}", e),
            }
        }
    }
    // 3. 尝试下载歌词
    use crate::netease::get_song_lyric;

    match get_song_lyric(song_hash.clone()).await {
        Ok(lyric_content) => {
            if !lyric_content.is_empty() {
                let lyric_path = lyrics_dir.join(format!("{}.lrc", base_filename));
                if let Err(e) = write_bytes_to_file(lyric_content.as_bytes(), &lyric_path) {
                    eprintln!("写入歌词失败: {}", e);
                }
            }
        }
        Err(e) => eprintln!("下载歌词失败: {}", e),
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
            .map_err(|e| format!("无法获取应用目录: {}", e))
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

    std::fs::read_to_string(&lyrics_path).map_err(|e| format!("读取歌词文件失败: {}", e))
}

/// clean file name
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

/// import music files from a directory into the default music directory
#[tauri::command]
pub fn import_music(
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
            .map_err(|e| format!("无法获取应用目录: {}", e))?
    };
    let music_dir = music_dir_from_library_root(&base_dir);
    create_dir_all(&music_dir).map_err(|e| format!("create music dir error: {}", e))?;

    let mut imported_count = 0;
    let mut failed_files = Vec::new();

    // 处理每个文件
    for file_path in files {
        let source_path = PathBuf::from(&file_path);

        // 检查文件是否存在
        if !source_path.is_file() {
            failed_files.push(format!("文件不存在或不是普通文件: {}", file_path));
            continue;
        }

        // 检查是否是支持的音频格式
        if let Some(extension) = source_path.extension().and_then(|ext| ext.to_str()) {
            if !["mp3", "wav", "ogg", "flac"].contains(&extension.to_lowercase().as_str()) {
                failed_files.push(format!("不支持的格式: {}", file_path));
                continue;
            }
        } else {
            failed_files.push(format!("无法识别文件格式: {}", file_path));
            continue;
        }

        // 获取文件名
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

    // 构建结果消息
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
}

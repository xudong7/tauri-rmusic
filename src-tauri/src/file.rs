use std::fs::{read_dir, create_dir_all, File};
use crate::netease::get_song_url;
use crate::music::MusicFile;
use std::io::Write;
use std::path::Path;
use tauri::Manager;
use tauri::AppHandle;

/// recursive scan the directory
/// and add the files to the list
pub fn scan_directory(
    base_path: &std::path::Path,
    dir_path: &std::path::Path,
    files: &mut Vec<MusicFile>,
    id: &mut i32,
) {
    if let Ok(entries) = read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                scan_directory(base_path, &path, files, id);
            } else if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                if ["mp3", "wav", "ogg", "flac"].contains(&extension.to_lowercase().as_str()) {
                    if let Ok(relative) = path.strip_prefix(base_path) {
                        if let Some(rel_path_str) = relative.to_str() {
                            files.push(MusicFile {
                                id: *id,
                                file_name: rel_path_str.to_string(),
                            });
                            *id += 1;
                        }
                    }
                }
            }
        }
    }
}

/// need to scan the files and abstract the certain file types
/// filter -> mp3, wav, ogg, flac
/// if path include a dir, the dir also need to be scanned
#[tauri::command]
pub fn scan_files(path: &str) -> Vec<MusicFile> {
    let mut music_files = Vec::new();
    let mut id_counter = 0;

    let base_path = std::path::Path::new(path).to_path_buf();

    let path_obj = std::path::Path::new(path);
    if path_obj.is_dir() {
        scan_directory(&base_path, &base_path, &mut music_files, &mut id_counter);
    } else {
        if let Some(extension) = path_obj.extension().and_then(|ext| ext.to_str()) {
            if ["mp3", "wav", "ogg", "flac"].contains(&extension.to_lowercase().as_str()) {
                if let Some(file_name) = path_obj.file_name().and_then(|f| f.to_str()) {
                    music_files.push(MusicFile {
                        id: id_counter,
                        file_name: file_name.to_string(),
                    });
                }
            }
        }
    }

    music_files
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
        create_dir_all(&music_dir)
            .map_err(|e| format!("create default dir error: {}", e))?;
    }
    
    music_dir.to_str()
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
) -> Result<String, String> {
    let song_url = get_song_url(song_hash).await?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(60)) 
        .build()
        .map_err(|e| format!("create client error: {}", e))?;

    let response = client
        .get(&song_url)
        .send()
        .await
        .map_err(|e| format!("get response error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("get response data error, status code: {}", response.status()));
    }

    // get bytes data
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read bytes data error: {}", e))?;

    // get default music directory
    let music_dir = get_default_music_dir(app_handle)?;

    // create file name
    let file_name = format!(
        "{} - {}.mp3",
        sanitize_filename(&artist),
        sanitize_filename(&song_name)
    );
    let file_path = Path::new(&music_dir).join(&file_name);

    // check if the file exists
    if file_path.exists() {
        return Err(format!("file already exists: {}", file_path.display()));
    }
    let mut file = File::create(&file_path).map_err(|e| format!("create file error: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("write error: {}", e))?;

    Ok(file_name)
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

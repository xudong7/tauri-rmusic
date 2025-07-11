use crate::music::MusicFile;
use crate::netease;
use crate::netease::get_song_url;
use std::fs::{self, create_dir_all, read_dir, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

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
pub fn scan_files(
    path: Option<String>,
    default_directory: Option<String>,
    app_handle: AppHandle,
) -> Vec<MusicFile> {
    let mut music_files = Vec::new();
    let mut id_counter = 0;

    // Determine which path to use
    let scan_path = if let Some(custom_path) = path {
        // If a specific path is provided, use it directly (for manual folder selection)
        custom_path
    } else if let Some(default_dir) = default_directory {
        // If default_directory is provided, scan the music subfolder within it
        std::path::Path::new(&default_dir)
            .join("music")
            .to_string_lossy()
            .to_string()
    } else {
        // Fall back to the default music directory
        match get_default_music_dir(app_handle) {
            Ok(default_path) => default_path,
            Err(_) => return music_files, // Return empty if we can't get default path
        }
    };

    let base_path = std::path::Path::new(&scan_path).to_path_buf();
    let path_obj = std::path::Path::new(&scan_path);
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

    // get bytes data
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read bytes data error: {}", e))?;

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
    let file_path = Path::new(&music_dir.to_str().unwrap()).join(&file_name);

    // check if the file exists
    if file_path.exists() {
        return Err(format!("file already exists: {}", file_path.display()));
    }
    let mut file = File::create(&file_path).map_err(|e| format!("create file error: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("write error: {}", e))?; // 下载封面图片
    let base_filename = file_name.replace(".mp3", "");

    use crate::netease::get_song_cover;

    let cover_url_result =
        get_song_cover(song_hash.clone(), song_name.clone(), artist.clone()).await;
    if let Ok(cover_url) = cover_url_result {
        if !cover_url.is_empty() {
            // 2. 下载封面图片
            match client.get(&cover_url).send().await {
                Ok(pic_response) => {
                    if pic_response.status().is_success() {
                        if let Ok(pic_bytes) = pic_response.bytes().await {
                            let cover_path = cover_dir.join(format!("{}.jpg", base_filename));
                            if let Ok(mut cover_file) = File::create(&cover_path) {
                                let _ = cover_file.write_all(&pic_bytes);
                            }
                        }
                    }
                }
                Err(e) => println!("下载封面失败: {}", e),
            }
        }
    }
    // 3. 尝试下载歌词
    use crate::netease::get_song_lyric;

    match get_song_lyric(song_hash.clone()).await {
        Ok(lyric_content) => {
            if !lyric_content.is_empty() {
                let lyric_path = lyrics_dir.join(format!("{}.lrc", base_filename));
                if let Ok(mut lyric_file) = File::create(&lyric_path) {
                    let _ = lyric_file.write_all(lyric_content.as_bytes());
                }
            }
        }
        Err(e) => println!("下载歌词失败: {}", e),
    }

    Ok(file_name)
}

/// load cover image and lyrics of certain song
#[tauri::command]
pub async fn load_cover_and_lyric(
    app_handle: AppHandle,
    file_name: String,
    default_directory: Option<String>,
) -> Result<(String, String), String> {
    // Determine the base directory to use
    let base_dir = if let Some(custom_dir) = default_directory {
        // Use the custom directory as base, look for subdirectories within it
        std::path::PathBuf::from(custom_dir)
    } else {
        // Fall back to app data directory
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法获取应用目录: {}", e))?
    };

    // 构建封面和歌词文件路径 - 从base_dir的子目录中查找
    let cover_path = base_dir
        .join("cover")
        .join(format!("{}.jpg", file_name.replace(".mp3", "")));
    let lyrics_path = base_dir
        .join("lyrics")
        .join(format!("{}.lrc", file_name.replace(".mp3", "")));

    // 初始化返回值
    let mut cover_content = String::new();
    let mut lyrics_content = String::new();

    // 读取封面图片（如果存在）
    if cover_path.exists() {
        // 封面是二进制文件，需要转为base64
        let cover_bytes =
            std::fs::read(&cover_path).map_err(|e| format!("读取封面文件失败: {}", e))?;
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;
        cover_content = format!("data:image/jpeg;base64,{}", STANDARD.encode(&cover_bytes));
    }

    // 读取歌词文件（如果存在）
    if lyrics_path.exists() {
        lyrics_content = std::fs::read_to_string(&lyrics_path)
            .map_err(|e| format!("读取歌词文件失败: {}", e))?;
    }

    Ok((cover_content, lyrics_content))
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

/// import music files from a directory into the default music directory
#[tauri::command]
pub fn import_music(
    app_handle: AppHandle,
    files: Vec<String>,
    default_directory: Option<String>,
) -> Result<String, String> {
    // 获取目标目录
    let music_dir = if let Some(custom_dir) = default_directory {
        PathBuf::from(custom_dir)
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法获取应用目录: {}", e))?
    };

    let mut imported_count = 0;
    let mut failed_files = Vec::new();

    // 处理每个文件
    for file_path in files {
        let source_path = PathBuf::from(&file_path);

        // 检查文件是否存在
        if !source_path.exists() {
            failed_files.push(format!("文件不存在: {}", file_path));
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

            // 检查目标文件是否已存在
            if target_path.exists() {
                // 如果文件已存在，生成新的文件名
                let mut counter = 1;
                let mut new_target_path = target_path.clone();

                while new_target_path.exists() {
                    if let Some(stem) = source_path.file_stem() {
                        if let Some(ext) = source_path.extension() {
                            let new_name = format!(
                                "{}_{}.{}",
                                stem.to_string_lossy(),
                                counter,
                                ext.to_string_lossy()
                            );
                            new_target_path = music_dir.join(new_name);
                            counter += 1;
                        }
                    }
                }

                // 复制文件到新路径
                match fs::copy(&source_path, &new_target_path) {
                    Ok(_) => {
                        imported_count += 1;
                    }
                    Err(e) => {
                        failed_files.push(format!("复制文件失败 {}: {}", file_path, e));
                    }
                }
            } else {
                // 直接复制文件
                match fs::copy(&source_path, &target_path) {
                    Ok(_) => {
                        imported_count += 1;
                    }
                    Err(e) => {
                        failed_files.push(format!("复制文件失败 {}: {}", file_path, e));
                    }
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

use std::fs::{read_dir, create_dir_all, File};
use crate::netease;
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

    // get default music directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("unable to get dir: {}", e))?;
    
    let music_dir = app_dir.join("music");
    
    if !music_dir.exists() {
        create_dir_all(&music_dir)
            .map_err(|e| format!("create music dir error: {}", e))?;
    }

    // 创建封面和歌词存放目录
    let cover_dir = app_dir.join("cover");
    let lyrics_dir = app_dir.join("lyrics");
    
    if !cover_dir.exists() {
        create_dir_all(&cover_dir)
            .map_err(|e| format!("create cover dir error: {}", e))?;
    }
    
    if !lyrics_dir.exists() {
        create_dir_all(&lyrics_dir)
            .map_err(|e| format!("create lyrics dir error: {}", e))?;
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
        .map_err(|e| format!("write error: {}", e))?;    // 下载封面图片
    let base_filename = file_name.replace(".mp3", "");
    
    use crate::netease::get_song_cover;
    
    let cover_url_result = get_song_cover(song_hash.clone(), song_name.clone(), artist.clone()).await;
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
) -> Result<(String, String), String> {
    // 获取应用数据目录
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;
    
    // 构建封面和歌词文件路径
    let cover_path = app_dir.join("cover").join(format!("{}.jpg", file_name.replace(".mp3", "")));
    let lyrics_path = app_dir.join("lyrics").join(format!("{}.lrc", file_name.replace(".mp3", "")));
    
    // 初始化返回值
    let mut cover_content = String::new();
    let mut lyrics_content = String::new();
    
    // 读取封面图片（如果存在）
    if cover_path.exists() {
        // 封面是二进制文件，需要转为base64
        let cover_bytes = std::fs::read(&cover_path)
            .map_err(|e| format!("读取封面文件失败: {}", e))?;
        cover_content = format!("data:image/jpeg;base64,{}", base64::encode(&cover_bytes));
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

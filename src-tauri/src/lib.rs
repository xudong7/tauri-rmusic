use music::{Music, MusicFile, MusicState};
use netease::{search_songs, get_song_url, play_netease_song};
use rodio::Sink;
use std::fs::read_dir;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::App;
use tokio::sync::broadcast::Sender;
use tokio::sync::Mutex;

mod music;
mod netease;

/// set up the tray
fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // setup the tray icon
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_i])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                println!("quit menu item was clicked");
                app.exit(0);
            }
            _ => {
                println!("menu item {:?} not handled", event.id);
            }
        })
        .build(app)?;
    Ok(())
}

/// handle the music events
/// play, pause, recovery, volume, quit
#[tauri::command]
fn handle_event(sender: tauri::State<Sender<MusicState>>, event: String) {
    let event: serde_json::Value = serde_json::from_str(&event).unwrap();
    if let Some(act) = event["action"].as_str() {
        match act {
            "play" => event["path"]
                .as_str()
                .map(|path| sender.send(MusicState::Play(path.to_owned()))),
            "recovery" => Some(sender.send(MusicState::Recovery)),
            "pause" => Some(sender.send(MusicState::Pause)),
            "volume" => event["volume"]
                .as_f64()
                .map(|vol| sender.send(MusicState::Volume(vol as f32))),
            "quit" => Some(sender.send(MusicState::Quit)),
            _ => None,
        };
    }
}

/// recursive scan the directory
/// and add the files to the list
fn scan_directory(
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
fn scan_files(path: &str) -> Vec<MusicFile> {
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

/// check if the sink is empty
#[tauri::command]
async fn is_sink_empty(sink: tauri::State<'_, Arc<Mutex<Sink>>>) -> Result<bool, String> {
    let sink_clone = Arc::clone(&sink);
    let sink = sink_clone.lock().await;
    Ok(sink.empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let music = Music::new();
    tauri::Builder::default()
        .setup(|app| {
            // setup the tray icon
            setup_tray(app).unwrap();

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            is_sink_empty,
            handle_event,
            scan_files,
            search_songs,
            get_song_url,
            play_netease_song,
        ])
        // share sender and sink with the frontend
        .manage(music.event_sender)
        .manage(music.sink)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

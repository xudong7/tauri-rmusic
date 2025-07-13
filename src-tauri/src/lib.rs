use file::{import_music, download_music, get_default_music_dir, load_cover_and_lyric, scan_files};
use music::{Music, MusicState};
use netease::{get_song_cover, get_song_lyric, get_song_url, play_netease_song, search_songs};
use rodio::Sink;
use service::setup_service;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::{StateFlags, WindowExt};
use tokio::sync::broadcast::Sender;
use tokio::sync::Mutex;
use tray::setup_tray;

mod file;
mod music;
mod netease;
mod service;
mod tray;

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

/// check if the sink is empty
#[tauri::command]
async fn is_sink_empty(sink: tauri::State<'_, Arc<Mutex<Sink>>>) -> Result<bool, String> {
    let sink_clone = Arc::clone(&sink);
    let sink = sink_clone.lock().await;
    Ok(sink.empty())
}

pub async fn play_next_song(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if IS_AUTO_PLAYING.swap(true, Ordering::SeqCst) {
        return Ok(()); // 防止重复触发
    }

    let next = get_next_song(&state).await;
    match next {
        Some(song) => {
            let state = state.clone();
            tauri::async_runtime::spawn(async move {
                let res = timeout(Duration::from_secs(3), load_and_play(state, song)).await;
                if res.is_err() {
                    eprintln!("播放超时，重试下一首");
                    let _ = play_next_song(state).await;
                }
                IS_AUTO_PLAYING.store(false, Ordering::SeqCst);
            });
            Ok(())
        }
        None => {
            IS_AUTO_PLAYING.store(false, Ordering::SeqCst);
            Err("无下一首".into())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let music = Music::new();
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let window = app
                .get_webview_window("main")
                .expect("failed to get main window");
            // If the app is already running, we can just focus the main window
            if let Err(e) = window.show() {
                eprintln!("Failed to show main window: {}", e);
            }
            if let Err(e) = window.set_focus() {
                eprintln!("Failed to focus main window: {}", e);
            }
        }))
        .setup(|app| {
            // setup the tray icon
            setup_tray(app).unwrap();

            // Get the main window - use "main" as the default window label
            let window = app
                .get_webview_window("main")
                .and_then(|w| {
                    // Restore the window state if it exists
                    w.restore_state(StateFlags::all()).ok()?;
                    Some(w)
                })
                .expect("failed to get main window");

            let window_for_app = window.clone();
            let window_for_app_win = window.clone();

            // Handle first sidecar (app)
            setup_service(app, "app", window_for_app)
                .unwrap_or_else(|e| println!("Failed to setup app sidecar: {}", e));

            // Handle second sidecar (app_win)
            setup_service(app, "app_win", window_for_app_win)
                .unwrap_or_else(|e| println!("Failed to setup app_win sidecar: {}", e));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_sink_empty,
            handle_event,
            scan_files,
            search_songs,
            import_music,
            get_song_url,
            play_netease_song,
            get_default_music_dir,
            download_music,
            get_song_lyric,
            load_cover_and_lyric,
            get_song_cover
        ])
        // share sender and sink with the frontend
        .manage(music.event_sender)
        .manage(music.sink)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

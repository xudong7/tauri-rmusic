use file::{download_music, get_default_music_dir, load_cover_and_lyric, scan_files};
use music::{Music, MusicState};
use netease::{get_song_cover, get_song_lyric, get_song_url, play_netease_song, search_songs};
use rodio::Sink;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::broadcast::Sender;
use tokio::sync::Mutex;
use tray::setup_tray;

mod file;
mod music;
mod netease;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let music = Music::new();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // setup the tray icon
            setup_tray(app).unwrap();

            // Get the main window - use "main" as the default window label
            let window = app
                .get_webview_window("main")
                .expect("failed to get main window");
            let window_for_app = window.clone();
            let window_for_app_win = window.clone();

            // Handle first sidecar (app)
            let app_sidecar_command = app.shell().sidecar("app").unwrap();
            let (mut rx, mut child) = app_sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");
            tauri::async_runtime::spawn(async move {
                // 读取诸如 stdout 之类的事件
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        window_for_app
                            .emit("message", Some(format!("{:?}", line)))
                            .expect("failed to emit event");
                        // 写入 stdin
                        child.write("message from Rust\n".as_bytes()).unwrap();
                    }
                }
            });

            // Handle second sidecar (app_win)
            let app_win_sidecar_command = app.shell().sidecar("app_win").unwrap();
            let (mut rx, mut child) = app_win_sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");
            tauri::async_runtime::spawn(async move {
                // 读取诸如 stdout 之类的事件
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        window_for_app_win
                            .emit("message_win", Some(format!("{:?}", line)))
                            .expect("failed to emit event");
                        // 写入 stdin
                        child
                            .write("message from Rust to Windows sidecar\n".as_bytes())
                            .unwrap();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_sink_empty,
            handle_event,
            scan_files,
            search_songs,
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

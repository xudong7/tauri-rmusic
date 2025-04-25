use file::{download_music, get_default_music_dir, load_cover_and_lyric, scan_files};
use music::{Music, MusicState};
use netease::{
    get_lyric, get_lyric_decoded, get_song_detail, get_song_url, play_netease_song, search_lyric,
    search_songs,
};
use rodio::Sink;
use std::sync::Arc;
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
            get_default_music_dir,
            download_music,
            search_lyric,
            get_lyric,
            get_lyric_decoded,
            load_cover_and_lyric
        ])
        // share sender and sink with the frontend
        .manage(music.event_sender)
        .manage(music.sink)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

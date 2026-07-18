use file::{
    download_music, get_default_music_dir, import_music, load_cached_music_files,
    load_local_cover_path, load_local_lyric, scan_files,
};
use music::{
    clear_online_audio_cache, get_online_audio_cache_path, get_online_audio_cache_size,
    get_playback_state, play_track, prefetch_netease_song, prepare_playback_request, seek_to,
    Music, MusicState, PlaybackRequestIdState,
};
use netease::{
    check_online_service_status, get_artist_top_songs, get_song_cover, get_song_lyric,
    get_song_url, play_netease_song, search_online_mix, search_songs,
};
use playlist::{read_playlists, write_playlists};
use service::{ensure_online_service, restart_online_service, OnlineServiceProcess};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::{StateFlags, WindowExt};
use tokio::sync::broadcast::Sender;
use tray::{quit_app as quit_app_handle, setup_tray};

mod file;
mod music;
mod netease;
mod playlist;
mod service;
mod tray;

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
enum PlaybackControlAction {
    Play,
    Pause,
    Volume,
}

/// Handle playback control actions that do not start a new track.
#[tauri::command]
fn control_playback(
    sender: tauri::State<Sender<MusicState>>,
    action: PlaybackControlAction,
    volume: Option<f32>,
) -> Result<(), String> {
    let music_state = match action {
        PlaybackControlAction::Play => MusicState::Recovery,
        PlaybackControlAction::Pause => MusicState::Pause,
        PlaybackControlAction::Volume => {
            let volume = volume.ok_or_else(|| "Missing volume".to_string())?;
            MusicState::Volume(volume)
        }
    };

    sender
        .send(music_state)
        .map(|_| ())
        .map_err(|e| format!("Send music event error: {}", e))
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    quit_app_handle(&app_handle);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let music = match Music::new() {
        Ok(music) => music,
        Err(e) => {
            eprintln!("Failed to initialize audio: {}", e);
            return;
        }
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(OnlineServiceProcess::default())
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
            if let Err(e) = setup_tray(app) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Get the main window - use "main" as the default window label
            app.get_webview_window("main")
                .and_then(|w| {
                    // Restore the window state if it exists
                    w.restore_state(StateFlags::all()).ok()?;
                    Some(w)
                })
                .expect("failed to get main window");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            control_playback,
            get_playback_state,
            play_track,
            prepare_playback_request,
            prefetch_netease_song,
            get_online_audio_cache_size,
            get_online_audio_cache_path,
            clear_online_audio_cache,
            seek_to,
            scan_files,
            load_cached_music_files,
            check_online_service_status,
            ensure_online_service,
            restart_online_service,
            search_songs,
            search_online_mix,
            get_artist_top_songs,
            import_music,
            get_song_url,
            play_netease_song,
            get_default_music_dir,
            download_music,
            get_song_lyric,
            load_local_cover_path,
            load_local_lyric,
            get_song_cover,
            read_playlists,
            write_playlists
        ])
        // share sender, sink, and duration with the frontend
        .manage(music.event_sender)
        .manage(music.sink)
        .manage(music.current_duration_ms)
        .manage(music.current_track_id)
        .manage(PlaybackRequestIdState::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

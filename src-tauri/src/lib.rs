use file::{
    download_music, get_default_music_dir, import_music, load_cached_music_files,
    load_local_cover_path, load_local_lyric, scan_files,
};
use music::{
    clear_online_audio_cache, get_online_audio_cache_path, get_online_audio_cache_size,
    get_playback_state, play_track, prefetch_netease_song, prepare_playback_request, seek_to,
    ActiveProgressiveDownload, Music, MusicState, PlaybackRequestIdState,
};
use netease::{
    check_online_service_status, get_album_detail, get_artist_albums, get_artist_detail,
    get_artist_songs, get_artist_top_songs, get_playlist_detail, get_playlist_tracks,
    get_song_cover, get_song_lyric, get_song_url, get_toplist, play_netease_song,
    search_online_albums, search_online_artists, search_online_mix, search_online_playlists,
    search_songs,
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
            if let Some(window) = app.get_webview_window("main") {
                // 恢复失败只应被忽略，不能升级成 panic：release 下 panic = "abort"，
                // 一旦保存的窗口坐标落在已断开的显示器上（restore_state 内部的
                // set_position 返回 Err），进程会在建窗之前直接死掉且无法自愈。
                if let Err(e) = window.restore_state(StateFlags::all()) {
                    eprintln!("Failed to restore window state: {}", e);
                }
            }

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
            search_online_playlists,
            search_online_albums,
            search_online_artists,
            get_playlist_detail,
            get_playlist_tracks,
            get_album_detail,
            get_toplist,
            get_artist_albums,
            get_artist_detail,
            get_artist_songs,
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
        .manage(ActiveProgressiveDownload::default())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                shutdown_sidecar_on_exit(app_handle);
            }
        });
}

/// 进程退出前收掉 sidecar。
///
/// 这是唯一覆盖全部退出路径的位置：`tray::quit_app` 只在托盘菜单里被调用，
/// 而 Cmd+Q（默认菜单的原生 quit）、关闭最后一个窗口都不经过它。sidecar 是
/// 独立进程，tauri-plugin-shell 的 CommandChild 也没有 Drop 实现，所以漏掉的
/// 路径会在 3000 端口留下一个孤儿 HTTP 服务：下次启动的新 sidecar 绑定端口
/// 失败退出，请求却打到残留进程上，行为和状态都不可控。
fn shutdown_sidecar_on_exit(app_handle: &tauri::AppHandle) {
    let Some(process) = app_handle.try_state::<OnlineServiceProcess>() else {
        return;
    };
    if let Err(e) = service::shutdown_service(process.inner()) {
        eprintln!("Failed to shutdown sidecar on exit: {}", e);
    }
}

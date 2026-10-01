use cover_cache::cache_online_cover;
use file::{
    delete_music_file, download_music, get_default_music_dir, import_music,
    load_cached_music_files, load_local_cover_path, load_local_lyric, scan_files,
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
use tauri_plugin_window_state::WindowExt;
use tokio::sync::broadcast::Sender;
use tray::{quit_app as quit_app_handle, setup_tray};

mod cover_cache;
mod file;
mod fs_util;
mod music;
mod netease;
mod playlist;
mod service;
mod tray;
mod window_state;

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

/// 前端首帧就绪：窗口不必再等服务预热。
///
/// 本地功能（曲库、播放列表）与前端的挂载不依赖 sidecar，首帧已经可以用了。
/// 线程/调用方幂等由 [`window_state::reveal_main_window`] 保证；预热路径稍后
/// 再调用一次也不会重复显示。
#[tauri::command]
fn reveal_main_window(app_handle: tauri::AppHandle) {
    window_state::reveal_main_window(&app_handle);
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
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state::restore_flags())
                .build(),
        )
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
            // 先把 sidecar 拉起来：这一步同步返回，只创建进程、不等就绪。放在最
            // 前面，建窗与前端挂载那段时间就正好被 Node 的启动吃掉。
            //
            // 「创建」与下面的「等待」分开写是刻意的：等待要跟预算赛跑，而超时
            // 分支会把等待 future 整个 drop 掉——创建若写在那个 future 里，就不
            // 保证会被执行。理由详见 service::start_sidecar 的注释。
            if let Err(e) = service::start_sidecar(app.handle()) {
                eprintln!("Failed to start online service at launch: {}", e);
            }

            // 主窗口在 conf 里是隐藏的（visible: false）。显示时机取三者最早：
            // 前端首帧就绪（reveal_main_window 命令，本地功能已经可用）、sidecar
            // 就绪、或 PREWARM_MAX_WAIT 预算用尽。前两者谁先到都行，预算保证窗口
            // 最终一定出现——包括前端脚本出错、根本没发首帧信号的情况，否则应用
            // 会变成一个永不露面的进程。这段时间里托盘图标已经在了（下面几行），
            // 用户仍有一个「应用活着」的落点。
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let cause = service::with_deadline(
                    service::wait_for_prewarm(),
                    service::PREWARM_MAX_WAIT,
                    || {
                        window_state::reveal_main_window(&handle);
                    },
                )
                .await;
                if cause == service::RevealCause::TimedOut {
                    eprintln!(
                        "Online service was not ready within {:?}; revealed the window anyway",
                        service::PREWARM_MAX_WAIT
                    );
                }
            });

            // setup the tray icon
            if let Err(e) = setup_tray(app) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Get the main window - use "main" as the default window label
            if let Some(window) = app.get_webview_window("main") {
                // 恢复失败只应被忽略，不能升级成 panic：release 下 panic = "abort"，
                // 一旦保存的窗口坐标落在已断开的显示器上（restore_state 内部的
                // set_position 返回 Err），进程会在建窗之前直接死掉且无法自愈。
                //
                // 标志里不能带 VISIBLE：那会让窗口在建窗这一刻就显示出来，预热
                // 也就白做了。两个插件调用点读的是同一个函数，不会走样。
                if let Err(e) = window.restore_state(window_state::restore_flags()) {
                    eprintln!("Failed to restore window state: {}", e);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            reveal_main_window,
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
            delete_music_file,
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
            cache_online_cover,
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
        .run(|app_handle, event| match event {
            tauri::RunEvent::Exit => shutdown_sidecar_on_exit(app_handle),
            // 预热期间窗口还没出现，用户这时点 Dock 图标，macOS 只会走到这里。
            // 没有这个分支，这段时间点图标毫无反应——最多 2s，但看起来像卡死。
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => {
                window_state::reveal_main_window(app_handle);
            }
            _ => {}
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

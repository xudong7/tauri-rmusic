use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Default)]
pub struct OnlineServiceProcess {
    child: Arc<Mutex<Option<CommandChild>>>,
}

/// 返回当前平台的 sidecar 名称（与 build.rs / lib.rs 中使用的名称一致）
pub fn sidecar_name_for_current_platform() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "app_linux"
    }
    #[cfg(target_os = "macos")]
    {
        "app_mac"
    }
    #[cfg(target_os = "windows")]
    {
        "app_win"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "app"
    }
}

/// set up the service for the sidecar
pub fn setup_service(
    app: &tauri::App,
    service_name: &str,
    window: tauri::webview::WebviewWindow,
) -> Result<(), String> {
    let process = app.state::<OnlineServiceProcess>();
    spawn_service(app.handle(), service_name, Some(window), process.inner())
}

fn spawn_service(
    app_handle: &tauri::AppHandle,
    service_name: &str,
    window: Option<tauri::webview::WebviewWindow>,
    process: &OnlineServiceProcess,
) -> Result<(), String> {
    if process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .is_some()
    {
        return Ok(());
    }

    let app_sidecar_command = app_handle
        .shell()
        .sidecar(service_name)
        .map_err(|e| format!("Failed to get sidecar command for {}: {}", service_name, e))?;

    let (mut rx, child) = app_sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar {}: {}", service_name, e))?;
    let pid = child.pid();
    process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .replace(child);

    let child_state = Arc::clone(&process.child);
    tauri::async_runtime::spawn(async move {
        // 读取诸如 stdout 之类的事件
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    if let Some(window) = &window {
                        if let Err(e) = window.emit("message", Some(format!("{:?}", line))) {
                            eprintln!("Failed to emit event: {}", e);
                        }
                    }
                }
                CommandEvent::Terminated(_) => {
                    if let Ok(mut current) = child_state.lock() {
                        if current.as_ref().map(CommandChild::pid) == Some(pid) {
                            current.take();
                        }
                    }
                }
                _ => {}
            }
        }
        if let Ok(mut current) = child_state.lock() {
            if current.as_ref().map(CommandChild::pid) == Some(pid) {
                current.take();
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn restart_online_service(
    app_handle: tauri::AppHandle,
    process: tauri::State<'_, OnlineServiceProcess>,
) -> Result<(), String> {
    let service_name = sidecar_name_for_current_platform();
    shutdown_service(process.inner())?;
    tokio::time::sleep(Duration::from_millis(500)).await;
    let window = app_handle.get_webview_window("main");
    spawn_service(&app_handle, service_name, window, process.inner())?;
    tokio::time::sleep(Duration::from_millis(800)).await;
    Ok(())
}

/// shutdown the service for the sidecar
pub fn shutdown_service(process: &OnlineServiceProcess) -> Result<(), String> {
    let child = process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .take();
    if let Some(child) = child {
        child
            .kill()
            .map_err(|e| format!("Failed to terminate online service: {}", e))?;
    }
    Ok(())
}

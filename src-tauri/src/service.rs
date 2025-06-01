use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// set up the service for the sidecar
pub fn setup_service(
    app: &tauri::App,
    service_name: &str,
    window: tauri::webview::WebviewWindow,
) -> Result<(), String> {
    let app_sidecar_command = app
        .shell()
        .sidecar(service_name)
        .map_err(|e| format!("Failed to get sidecar command for {}: {}", service_name, e))?;

    let (mut rx, mut child) = app_sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar {}: {}", service_name, e))?;

    tauri::async_runtime::spawn(async move {
        // 读取诸如 stdout 之类的事件
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                if let Err(e) = window.emit("message", Some(format!("{:?}", line))) {
                    eprintln!("Failed to emit event: {}", e);
                }
                // 写入 stdin
                if let Err(e) = child.write("message from Rust\n".as_bytes()) {
                    eprintln!("Failed to write to stdin: {}", e);
                }
            }
        }
    });
    Ok(())
}

/// shutdown the service for the sidecar
pub fn shutdown_service(service_name: &str) -> Result<(), String> {
    // 尝试终止相关的进程
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // 获取进程名
        let process_name = format!("{}.exe", service_name);

        // 使用 taskkill 强制终止进程
        match Command::new("taskkill")
            .args(&["/F", "/IM", &process_name])
            .output()
        {
            Ok(_) => println!("Successfully terminated {} process", service_name),
            Err(e) => eprintln!("Failed to terminate {} process: {}", service_name, e),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        // 对于类 Unix 系统，使用 killall 或 pkill
        match Command::new("pkill").arg("-f").arg(service_name).output() {
            Ok(_) => println!("Successfully terminated {} process", service_name),
            Err(e) => eprintln!("Failed to terminate {} process: {}", service_name, e),
        }
    }

    Ok(())
}

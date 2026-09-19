use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 目标路径旁的唯一临时文件名：`<name>.<pid>.<nanos>.tmp`。
///
/// 下载与写入都先落临时文件、成功后再原子提交，避免中途失败留下半成品
/// 覆盖正式文件；文件名带 pid 与纳秒时间戳，避免并发任务互相踩踏。
pub fn unique_temp_path_for(target_path: &Path) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");

    target_path.with_file_name(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        unique
    ))
}

/// 把临时文件提交到目标路径（Windows 上先删除已存在的目标）。
pub fn commit_temp_file(tmp_path: &Path, target_path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    if target_path.exists() {
        std::fs::remove_file(target_path).map_err(|e| format!("replace file: {}", e))?;
    }

    std::fs::rename(tmp_path, target_path).map_err(|e| format!("commit file error: {}", e))
}

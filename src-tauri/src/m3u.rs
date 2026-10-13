//! M3U 播放列表的读写。
//!
//! 只负责文件 IO 与编码：解析（#EXTINF、路径行）与匹配曲库放在前端
//! `src/utils/m3u.ts`，那里能直接单测，也不必为格式细节来回 IPC。

/// 去掉 UTF-8 BOM。
///
/// Windows 上的播放器写 m3u8 常带 BOM，留着它会让第一行变成
/// "\u{feff}#EXTM3U"，前端按 `#` 前缀判断注释时就认不出来了。
fn strip_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

/// 读取 M3U/M3U8 文本。
#[tauri::command]
pub async fn read_m3u_file(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read m3u file: {}", e))?;
    // 损失性解码：编码不对时宁可显示乱码行，也不要整份读不出来
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok(strip_bom(&text).to_string())
}

/// 写出 M3U 文本（UTF-8 无 BOM）。
#[tauri::command]
pub async fn write_m3u_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("write m3u file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_bom_only_touches_a_leading_bom() {
        assert_eq!(strip_bom("\u{feff}#EXTM3U"), "#EXTM3U");
        assert_eq!(strip_bom("#EXTM3U"), "#EXTM3U");
        // 中间出现的同名码位不是 BOM，不能动
        assert_eq!(strip_bom("a\u{feff}b"), "a\u{feff}b");
        assert_eq!(strip_bom(""), "");
    }
}

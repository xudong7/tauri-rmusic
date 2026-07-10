/**
 * 本地封面与歌词加载（供 PlayerBar、ImmersiveView、LyricView 复用）
 */
import { loadLocalCoverPath } from "@/api/commands/file";
import { convertFileSrc } from "@tauri-apps/api/core";

/** 加载本地封面图 URL；歌词由 LyricView 单独读取，避免封面经 IPC/base64 传输。 */
export async function loadLocalCover(
  fileName: string,
  getDefaultDirectory: () => string | null
): Promise<string> {
  try {
    const path = await loadLocalCoverPath({
      fileName,
      defaultDirectory: getDefaultDirectory(),
    });
    if (path) return convertFileSrc(path);
    return "";
  } catch (e) {
    console.error("加载本地封面失败:", e);
    return "";
  }
}

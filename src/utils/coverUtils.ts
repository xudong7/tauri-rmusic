/**
 * 本地封面与歌词加载（供 PlayerBar、ImmersiveView、LyricView 复用）
 */
import { loadCoverAndLyric } from "@/api/commands/file";

/** 加载本地封面图 URL， lyric 由 LyricView 自行 load_cover_and_lyric 取第二项 */
export async function loadLocalCover(
  fileName: string,
  getDefaultDirectory: () => string | null
): Promise<string> {
  try {
    const result = await loadCoverAndLyric({
      fileName,
      defaultDirectory: getDefaultDirectory(),
    });
    return Array.isArray(result) && result.length > 0 ? result[0] || "" : "";
  } catch (e) {
    console.error("加载本地封面失败:", e);
    return "";
  }
}

/**
 * 歌曲/文件名解析与格式化工具（高内聚、可复用）
 */

/** 从路径取文件名（含扩展名） */
export function getFileName(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\/\\]/);
  return parts[parts.length - 1];
}

/** 从路径取显示名（去掉扩展名） */
export function getDisplayName(path: string): string {
  return getFileName(path).replace(/\.[^/.]+$/, "");
}

/** 从 "歌手 - 歌曲" 格式提取歌手名 */
export function extractArtistName(fullName: string): string {
  if (!fullName) return "";
  const match = fullName.match(/^(.+?)\s*-\s*.+$/);
  return match ? match[1].trim() : "";
}

/** 从 "歌手 - 歌曲" 格式提取歌曲名 */
export function extractSongTitle(fullName: string): string {
  if (!fullName) return "";
  const match = fullName.match(/\s*-\s*(.+)$/);
  return match ? match[1].trim() : fullName;
}

/** 格式化艺术家列表 */
export function formatArtists(artists: string[]): string {
  return artists?.join(", ") ?? "";
}

/** 将毫秒格式化为 "m:ss" */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

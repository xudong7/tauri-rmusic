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

/** 与后端 file.rs 一致的文件名清理（用于判断是否已下载） */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

/** 在线歌曲下载后的预期文件名（与后端 download_music 格式一致） */
export function getExpectedDownloadFileName(song: {
  name: string;
  artists: string[];
}): string {
  const artist = (song.artists ?? []).join(", ");
  return `${sanitizeFilename(artist)} - ${sanitizeFilename(song.name)}.mp3`;
}

/** 判断在线歌曲是否已在本地（musicFiles 中存在同名文件） */
export function isSongDownloaded(
  song: { name: string; artists: string[] },
  musicFiles: { file_name: string }[]
): boolean {
  const expected = getExpectedDownloadFileName(song);
  return musicFiles.some(
    (f) =>
      f.file_name === expected ||
      f.file_name.endsWith("/" + expected) ||
      f.file_name.endsWith("\\" + expected)
  );
}

/** 在 musicFiles 中查找与在线歌曲对应的本地 file_name，用于添加到播放列表 */
export function getLocalFileNameForSong(
  song: { name: string; artists: string[] },
  musicFiles: { file_name: string }[]
): string | null {
  const expected = getExpectedDownloadFileName(song);
  const found = musicFiles.find(
    (f) =>
      f.file_name === expected ||
      f.file_name.endsWith("/" + expected) ||
      f.file_name.endsWith("\\" + expected)
  );
  return found ? found.file_name : null;
}

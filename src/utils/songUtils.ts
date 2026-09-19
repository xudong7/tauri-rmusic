/**
 * 歌曲/文件名解析与格式化工具（高内聚、可复用）
 */

import type { MusicFile } from "@/types/model";

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

/**
 * 将展示用歌手字符串拆成多个歌手名。
 *
 * 支持逗号（英文/中文）与展示分隔符 ` / `（两侧带空格）。
 * 斜杠必须带空格才算分隔符：`AC/DC` 这类名字不能被拆开。
 */
export function splitArtistNames(display: string): string[] {
  if (!display) return [];
  const normalized = display
    .replace(/\s*(?:,|，)\s*/g, ",")
    .replace(/\s+\/\s+/g, ",")
    .trim();
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 标签里的歌手串：拆开后按展示分隔符重排，避免逗号被当成名字的一部分 */
export function formatArtistDisplay(display: string): string {
  const parts = splitArtistNames(display);
  return parts.length > 1 ? parts.join(ARTIST_SEPARATOR) : display;
}

/** 优先使用音频元数据，缺失时回退到文件名解析 */
export function getLocalMusicDisplayInfo(file: MusicFile, unknownArtist = "") {
  const displayName = getDisplayName(file.file_name);
  return {
    title: file.title?.trim() || extractSongTitle(displayName) || displayName,
    artist: formatArtistDisplay(
      file.artist?.trim() || extractArtistName(displayName) || unknownArtist
    ),
    album: file.album?.trim() || undefined,
  };
}

/**
 * 多个歌手的展示分隔符。
 *
 * 展示不用逗号：歌手名本身可能带逗号，逗号会让整行看起来像被切碎的名字。
 * 需要与后端文件名/接口参数保持一致的地方（下载、播放请求）仍用 ", "，
 * 不能换成这个常量。
 */
export const ARTIST_SEPARATOR = " / ";

/** 格式化艺术家列表（仅用于展示） */
export function formatArtists(artists: string[]): string {
  return artists?.join(ARTIST_SEPARATOR) ?? "";
}

/** 将毫秒格式化为 "m:ss" */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 行内时长标签：未知时长返回 undefined，由调用方决定是否渲染 */
export function formatDurationLabel(ms: number | null | undefined): string | undefined {
  return ms && ms > 0 ? formatDuration(ms) : undefined;
}

/**
 * 按 locale 压缩大数字，用于播放量、曲目数等。
 * 交给 Intl 而不是自己拼「万/亿」：中文得到 1.2万，英文得到 12K。
 */
export function formatCompactNumber(value: number, locale = "zh-CN"): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** 毫秒时间戳 → 本地化日期（仅年月日）。无效或缺失时返回空串，由调用方决定是否渲染。 */
export function formatPublishDate(ms: number, locale = "zh-CN"): string {
  if (!ms || ms <= 0) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
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

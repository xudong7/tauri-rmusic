import type { MusicFile } from "@/types/model";
import { ARTIST_SEPARATOR, getFileName } from "@/utils/songUtils";

/**
 * 本地曲库的专辑/歌手分组与排序。
 *
 * 只依据音频标签做分组，不做任何联网补全：标签缺失的曲目归入「未知」组，
 * 与列表页对未知歌手/专辑的处理一致。分组/排序都是纯函数，便于单测。
 */

/** 未知分组的稳定 key（真实名称可能是空串） */
const UNKNOWN_GROUP_KEY = "\u0000unknown";

export interface LocalAlbumGroup {
  key: string;
  /** 专辑名（标签原文）；空串表示未知专辑，显示名由视图补 */
  name: string;
  /** 组内第一首带歌手标签的曲目的歌手 */
  artist: string;
  tracks: MusicFile[];
  durationMs: number;
  /** 第一首曲目：视图中用于解析封面（没有封面时显示占位图） */
  coverFile: MusicFile | null;
  /** 组内最新的文件修改时间，用于「最近添加」排序 */
  addedMs: number;
}

export interface LocalArtistGroup {
  key: string;
  name: string;
  tracks: MusicFile[];
  albumCount: number;
  durationMs: number;
  coverFile: MusicFile | null;
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * 专辑内排序：先碟号再曲序；缺标签的排在各自碟的末尾（保持稳定顺序）。
 * 没有这两个标签的曲目因此仍按扫描顺序展示，不会被乱排。
 */
function compareAlbumTracks(a: MusicFile, b: MusicFile): number {
  const discA = a.disc_number ?? 1;
  const discB = b.disc_number ?? 1;
  if (discA !== discB) return discA - discB;
  const trackA = a.track_number ?? Number.MAX_SAFE_INTEGER;
  const trackB = b.track_number ?? Number.MAX_SAFE_INTEGER;
  return trackA - trackB;
}

function albumKeyOf(file: MusicFile): string {
  const album = (file.album ?? "").trim();
  return album ? album.toLowerCase() : UNKNOWN_GROUP_KEY;
}

/** 一首歌可能标记多个歌手（「A / B」），每个歌手各计入一组 */
function artistNamesOf(file: MusicFile): string[] {
  const raw = (file.artist ?? "").trim();
  if (!raw) return [];
  return raw
    .split(ARTIST_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function groupMusicFilesByAlbum(files: MusicFile[]): LocalAlbumGroup[] {
  const groups = new Map<string, LocalAlbumGroup>();

  for (const file of files) {
    const key = albumKeyOf(file);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: (file.album ?? "").trim(),
        artist: "",
        tracks: [],
        durationMs: 0,
        coverFile: file,
        addedMs: 0,
      };
      groups.set(key, group);
    }
    group.tracks.push(file);
    group.durationMs += Math.max(0, file.duration_ms ?? 0);
    group.addedMs = Math.max(group.addedMs, file.modified_ms ?? 0);
    if (!group.artist && file.artist?.trim()) group.artist = file.artist.trim();
  }

  // 组内按碟号/曲序排列；没有标签的保持扫描顺序
  for (const group of groups.values()) {
    group.tracks.sort(compareAlbumTracks);
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.name) return 1;
    if (!b.name) return -1;
    return compareNames(a.name, b.name);
  });
}

export function groupMusicFilesByArtist(files: MusicFile[]): LocalArtistGroup[] {
  const groups = new Map<string, LocalArtistGroup>();
  const albumKeysByArtist = new Map<string, Set<string>>();

  for (const file of files) {
    const names = artistNamesOf(file);
    // 没有歌手标签的曲目也要有条目可点，归入统一的「未知」组
    for (const name of names.length > 0 ? names : [""]) {
      const key = name ? name.toLowerCase() : UNKNOWN_GROUP_KEY;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name,
          tracks: [],
          albumCount: 0,
          durationMs: 0,
          coverFile: file,
        };
        groups.set(key, group);
        albumKeysByArtist.set(key, new Set());
      }
      group.tracks.push(file);
      group.durationMs += Math.max(0, file.duration_ms ?? 0);
      albumKeysByArtist.get(key)?.add(albumKeyOf(file));
    }
  }

  for (const [key, group] of groups) {
    group.albumCount = albumKeysByArtist.get(key)?.size ?? 0;
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.name) return 1;
    if (!b.name) return -1;
    return compareNames(a.name, b.name);
  });
}

export type LibrarySortMode =
  | "default"
  | "title"
  | "artist"
  | "album"
  | "duration"
  | "added";

export const LIBRARY_SORT_MODES: LibrarySortMode[] = [
  "default",
  "title",
  "artist",
  "album",
  "duration",
  "added",
];

/**
 * 解析持久化的排序方式。
 *
 * 兼容两种历史格式：直接存 mode 字符串，以及短暂出现过的
 * `{ mode, direction }` JSON；损坏或未知值回落到默认。
 */
export function parseStoredSortMode(raw: string | null): LibrarySortMode {
  if (!raw) return "default";
  if (LIBRARY_SORT_MODES.includes(raw as LibrarySortMode)) {
    return raw as LibrarySortMode;
  }

  try {
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return LIBRARY_SORT_MODES.includes(parsed.mode as LibrarySortMode)
      ? (parsed.mode as LibrarySortMode)
      : "default";
  } catch {
    return "default";
  }
}

const UNKNOWN_SORT_SENTINEL = "\uffff";

function displayTitleOf(file: MusicFile): string {
  const title = file.title?.trim();
  if (title) return title;
  const fileName = getFileName(file.file_name);
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** 排序键，缺失值排最后（用哨兵字符而非空串，空串会排到最前） */
function sortKeyOf(file: MusicFile, mode: LibrarySortMode): string {
  switch (mode) {
    case "title":
      return displayTitleOf(file);
    case "artist":
      return file.artist?.trim() || UNKNOWN_SORT_SENTINEL;
    case "album":
      return file.album?.trim() || UNKNOWN_SORT_SENTINEL;
    default:
      return "";
  }
}

export function sortMusicFiles(files: MusicFile[], mode: LibrarySortMode): MusicFile[] {
  if (mode === "default" || files.length <= 1) return files;

  const sorted = [...files];
  if (mode === "duration") {
    // 时长升序：短歌在前，和列表点「时长」排序的直觉一致
    sorted.sort((a, b) => (a.duration_ms ?? 0) - (b.duration_ms ?? 0));
    return sorted;
  }
  if (mode === "added") {
    // 最近添加在前
    sorted.sort((a, b) => (b.modified_ms ?? 0) - (a.modified_ms ?? 0));
    return sorted;
  }

  sorted.sort((a, b) => compareNames(sortKeyOf(a, mode), sortKeyOf(b, mode)));
  return sorted;
}

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

export type LibrarySortDirection = "asc" | "desc";

export interface LibrarySortState {
  mode: LibrarySortMode;
  direction: LibrarySortDirection;
}

/** 每种模式的默认方向：最近添加习惯「新的在前」，其余升序 */
export function defaultSortDirection(mode: LibrarySortMode): LibrarySortDirection {
  return mode === "added" ? "desc" : "asc";
}

/**
 * 解析持久化的排序状态。
 *
 * 兼容旧格式（直接存 mode 字符串，没有方向）；损坏或未知值回落到默认。
 */
export function parseStoredSort(raw: string | null): LibrarySortState {
  const fallback: LibrarySortState = { mode: "default", direction: "asc" };
  if (!raw) return fallback;

  if (LIBRARY_SORT_MODES.includes(raw as LibrarySortMode)) {
    const mode = raw as LibrarySortMode;
    return { mode, direction: defaultSortDirection(mode) };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LibrarySortState>;
    const mode = LIBRARY_SORT_MODES.includes(parsed.mode as LibrarySortMode)
      ? (parsed.mode as LibrarySortMode)
      : "default";
    return { mode, direction: parsed.direction === "desc" ? "desc" : "asc" };
  } catch {
    return fallback;
  }
}

export function serializeSort(state: LibrarySortState): string {
  return JSON.stringify(state);
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

export function sortMusicFiles(
  files: MusicFile[],
  mode: LibrarySortMode,
  direction: LibrarySortDirection = defaultSortDirection(mode)
): MusicFile[] {
  if (mode === "default" || files.length <= 1) return files;

  const sign = direction === "desc" ? -1 : 1;
  const sorted = [...files];

  if (mode === "duration") {
    sorted.sort((a, b) => sign * ((a.duration_ms ?? 0) - (b.duration_ms ?? 0)));
    return sorted;
  }
  if (mode === "added") {
    sorted.sort((a, b) => sign * ((a.modified_ms ?? 0) - (b.modified_ms ?? 0)));
    return sorted;
  }

  sorted.sort((a, b) => sign * compareNames(sortKeyOf(a, mode), sortKeyOf(b, mode)));
  return sorted;
}

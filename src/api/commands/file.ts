import type { MusicFile } from "@/types/model";
import { invokeCommand } from "../client";

export async function scanFiles(args: {
  path: string | null;
  defaultDirectory: string | null;
}): Promise<MusicFile[]> {
  return await invokeCommand("scan_files", args);
}

export async function loadCachedMusicFiles(args: {
  path: string | null;
  defaultDirectory: string | null;
}): Promise<MusicFile[]> {
  return await invokeCommand("load_cached_music_files", args);
}

export async function getDefaultMusicDir(): Promise<string> {
  return await invokeCommand("get_default_music_dir");
}

export async function importMusic(args: {
  files: string[];
  defaultDirectory: string | null;
}): Promise<string> {
  return await invokeCommand("import_music", args);
}

export async function loadLocalCoverPath(args: {
  fileName: string;
  defaultDirectory: string | null;
}): Promise<string | null> {
  return await invokeCommand("load_local_cover_path", args);
}

/** 从曲库删除一首歌（音频 + 它的封面与歌词）。不可撤销。 */
export async function deleteMusicFile(args: {
  fileName: string;
  defaultDirectory: string | null;
}): Promise<void> {
  await invokeCommand("delete_music_file", args);
}

export async function loadLocalLyric(args: {
  fileName: string;
  defaultDirectory: string | null;
}): Promise<string> {
  return await invokeCommand("load_local_lyric", args);
}

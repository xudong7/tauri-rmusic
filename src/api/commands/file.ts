import type { MusicFile } from "@/types/model";
import { invokeCommand } from "../client";

export async function scanFiles(args: {
  path: string | null;
  defaultDirectory: string | null;
}): Promise<MusicFile[]> {
  // Rust 侧返回结构与 MusicFile[] 一致
  return (await invokeCommand("scan_files", args)) as unknown as MusicFile[];
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

export async function loadCoverAndLyric(args: {
  fileName: string;
  defaultDirectory: string | null;
}): Promise<[string, string]> {
  return await invokeCommand("load_cover_and_lyric", args);
}

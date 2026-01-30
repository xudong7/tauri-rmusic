import type { Playlist } from "@/types/model";
import { invokeCommand } from "../client";

export async function readPlaylists(): Promise<Playlist[]> {
  const list = (await invokeCommand("read_playlists")) as Playlist[];
  return Array.isArray(list) ? list : [];
}

export async function writePlaylists(playlists: Playlist[]): Promise<void> {
  await invokeCommand("write_playlists", { playlists });
}

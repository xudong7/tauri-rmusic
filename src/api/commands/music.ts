import type { PlaySongResult } from "@/types/model";
import { invokeCommand } from "../client";
import type { HandleEventAction } from "../types";

export async function handleEvent(
  action: HandleEventAction,
  payload: Record<string, unknown>
) {
  return await invokeCommand("handle_event", {
    event: JSON.stringify({ action, ...payload }),
  });
}

export async function playNeteaseSong(args: {
  id: string;
  name: string;
  artist: string;
}): Promise<PlaySongResult> {
  return await invokeCommand("play_netease_song", args);
}

export async function downloadMusic(args: {
  songHash: string;
  songName: string;
  artist: string;
  defaultDirectory: string | null;
}): Promise<string> {
  return await invokeCommand("download_music", args);
}

export async function isSinkEmpty(): Promise<boolean> {
  return await invokeCommand("is_sink_empty");
}

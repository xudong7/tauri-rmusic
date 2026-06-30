import type { PlaybackSource, PlaySongResult, PlayStartResult } from "@/types/model";
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

export async function playTrack(source: PlaybackSource): Promise<PlayStartResult> {
  return await invokeCommand("play_track", { source });
}

export async function getOnlineAudioCacheSize(): Promise<number> {
  return await invokeCommand("get_online_audio_cache_size");
}

export async function clearOnlineAudioCache(): Promise<void> {
  return await invokeCommand("clear_online_audio_cache");
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

export interface PlaybackProgress {
  position_ms: number;
  duration_ms: number;
  is_ended: boolean;
}

export interface PlaybackState extends PlaybackProgress {
  is_paused: boolean;
  has_track: boolean;
  track_id: number;
}

export interface SeekResult {
  success: boolean;
  should_play_next: boolean;
}

export async function getProgress(): Promise<PlaybackProgress> {
  return await invokeCommand("get_progress");
}

export async function getPlaybackState(): Promise<PlaybackState> {
  return await invokeCommand("get_playback_state");
}

export async function seekTo(positionMs: number): Promise<SeekResult> {
  return await invokeCommand("seek_to", { positionMs });
}

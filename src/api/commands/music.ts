import type { PlaybackSource, PlaySongResult, PlayStartResult } from "@/types/model";
import { invokeCommand } from "../client";
import type { HandleEventAction } from "../types";

export async function handleEvent(
  action: HandleEventAction,
  payload: Record<string, unknown>
) {
  return await invokeCommand("control_playback", {
    action: action === "recovery" ? "play" : action,
    volume: typeof payload.volume === "number" ? payload.volume : null,
  });
}

export async function playNeteaseSong(args: {
  id: string;
  name: string;
  artist: string;
  picUrl?: string;
}): Promise<PlaySongResult> {
  return await invokeCommand("play_netease_song", args);
}

export async function playTrack(
  source: PlaybackSource,
  requestId: number
): Promise<PlayStartResult> {
  return await invokeCommand("play_track", { source, requestId });
}

export async function preparePlaybackRequest(requestId: number): Promise<void> {
  await invokeCommand("prepare_playback_request", { requestId });
}

export async function prefetchNeteaseSong(id: string): Promise<void> {
  await invokeCommand("prefetch_netease_song", { id });
}

export async function getOnlineAudioCacheSize(): Promise<number> {
  return await invokeCommand("get_online_audio_cache_size");
}

export async function getOnlineAudioCachePath(): Promise<string> {
  return await invokeCommand("get_online_audio_cache_path");
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

export interface PlaybackState {
  position_ms: number;
  duration_ms: number;
  is_ended: boolean;
  is_paused: boolean;
  has_track: boolean;
  track_id: number;
}

export interface SeekResult {
  success: boolean;
  should_play_next: boolean;
}

export async function getPlaybackState(): Promise<PlaybackState> {
  return await invokeCommand("get_playback_state");
}

export async function seekTo(positionMs: number): Promise<SeekResult> {
  return await invokeCommand("seek_to", { positionMs });
}

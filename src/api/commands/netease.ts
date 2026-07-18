import type {
  ArtistSongsResult,
  OnlineServiceStatus,
  SearchMixResult,
} from "@/types/model";
import { invokeCommand } from "../client";

export async function searchOnlineMix(args: {
  keywords: string;
  page: number;
  pagesize: number;
  songLimit?: number;
  artistLimit?: number;
}): Promise<SearchMixResult> {
  return await invokeCommand("search_online_mix", args);
}

export async function getArtistTopSongs(args: {
  id: string;
  limit: number;
}): Promise<ArtistSongsResult> {
  return await invokeCommand("get_artist_top_songs", args);
}

export async function getSongLyric(args: { id: string }): Promise<string> {
  return await invokeCommand("get_song_lyric", args);
}

export async function checkOnlineServiceStatus(): Promise<OnlineServiceStatus> {
  return await invokeCommand("check_online_service_status");
}

export async function ensureOnlineService(): Promise<void> {
  return await invokeCommand("ensure_online_service");
}

export async function restartOnlineService(): Promise<void> {
  return await invokeCommand("restart_online_service");
}

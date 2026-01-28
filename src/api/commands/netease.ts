import type { ArtistSongsResult, SearchMixResult } from "@/types/model";
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

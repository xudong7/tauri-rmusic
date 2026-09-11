import type {
  AlbumDetailResult,
  AlbumSearchResult,
  ArtistAlbumResult,
  ArtistDetailResult,
  ArtistSearchResult,
  ArtistSongsResult,
  OnlineServiceStatus,
  PlaylistDetailResult,
  PlaylistSearchResult,
  PlaylistTracksResult,
  SearchMixResult,
  ToplistResult,
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

export async function searchOnlinePlaylists(args: {
  keywords: string;
  page: number;
  pagesize: number;
}): Promise<PlaylistSearchResult> {
  return await invokeCommand("search_online_playlists", args);
}

export async function searchOnlineAlbums(args: {
  keywords: string;
  page: number;
  pagesize: number;
}): Promise<AlbumSearchResult> {
  return await invokeCommand("search_online_albums", args);
}

export async function searchOnlineArtists(args: {
  keywords: string;
  page: number;
  pagesize: number;
}): Promise<ArtistSearchResult> {
  return await invokeCommand("search_online_artists", args);
}

export async function getPlaylistDetail(args: {
  id: string;
}): Promise<PlaylistDetailResult> {
  return await invokeCommand("get_playlist_detail", args);
}

export async function getPlaylistTracks(args: {
  id: string;
  offset: number;
  limit: number;
  trackCount: number;
}): Promise<PlaylistTracksResult> {
  return await invokeCommand("get_playlist_tracks", args);
}

export async function getAlbumDetail(args: { id: string }): Promise<AlbumDetailResult> {
  return await invokeCommand("get_album_detail", args);
}

export async function getToplist(): Promise<ToplistResult> {
  return await invokeCommand("get_toplist");
}

export async function getArtistAlbums(args: {
  id: string;
  page: number;
  pagesize: number;
}): Promise<ArtistAlbumResult> {
  return await invokeCommand("get_artist_albums", args);
}

export async function getArtistDetail(args: { id: string }): Promise<ArtistDetailResult> {
  return await invokeCommand("get_artist_detail", args);
}

export async function getArtistSongs(args: {
  id: string;
  page: number;
  pagesize: number;
  order: "hot" | "time";
}): Promise<ArtistSongsResult> {
  return await invokeCommand("get_artist_songs", args);
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

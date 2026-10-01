import type {
  AlbumDetailResult,
  AlbumSearchResult,
  ArtistAlbumResult,
  ArtistDetailResult,
  ArtistSearchResult,
  ArtistSongsResult,
  ArtistSongsPage,
  OnlineServiceStatus,
  PlaylistDetailResult,
  PlaylistSearchResult,
  PlaylistTracksResult,
  SearchMixResult,
  ToplistResult,
} from "@/types/model";
import { DETAIL_CACHE_MAX_ENTRIES, DETAIL_CACHE_TTL_MS } from "@/constants";
import { createTtlCache } from "@/utils/ttlCache";
import type { TauriCommandParamsMap, TauriCommandResultMap } from "../types";
import { invokeCommand } from "../client";

/**
 * 详情类命令的内存缓存。
 *
 * 专辑/歌单/歌手/榜单/歌词在一次会话里会被反复进出，数据却几乎不变；缓存
 * 直接做在命令层，所有 store 与视图都受益，也不需要各自维护失效逻辑。
 * 搜索与播放地址不在此列：前者由 store 按关键词缓存，后者的 URL 有时效。
 */
const detailCache = createTtlCache<unknown>(
  DETAIL_CACHE_TTL_MS,
  DETAIL_CACHE_MAX_ENTRIES
);

async function invokeCachedCommand<
  K extends keyof TauriCommandParamsMap & keyof TauriCommandResultMap,
>(name: K, args: TauriCommandParamsMap[K]): Promise<TauriCommandResultMap[K]> {
  const key = `${name}:${JSON.stringify(args ?? null)}`;
  const cached = detailCache.get(key);
  if (cached !== undefined) return cached as TauriCommandResultMap[K];

  const result = await invokeCommand(name, args);
  detailCache.set(key, result);
  return result;
}

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
  return await invokeCachedCommand("get_playlist_detail", args);
}

export async function getPlaylistTracks(args: {
  id: string;
  offset: number;
  limit: number;
  trackCount: number;
}): Promise<PlaylistTracksResult> {
  return await invokeCachedCommand("get_playlist_tracks", args);
}

export async function getAlbumDetail(args: { id: string }): Promise<AlbumDetailResult> {
  return await invokeCachedCommand("get_album_detail", args);
}

export async function getToplist(): Promise<ToplistResult> {
  return await invokeCachedCommand("get_toplist", undefined);
}

export async function getArtistAlbums(args: {
  id: string;
  page: number;
  pagesize: number;
}): Promise<ArtistAlbumResult> {
  return await invokeCachedCommand("get_artist_albums", args);
}

export async function getArtistDetail(args: { id: string }): Promise<ArtistDetailResult> {
  return await invokeCachedCommand("get_artist_detail", args);
}

export async function getArtistSongs(args: {
  id: string;
  page: number;
  pagesize: number;
  order: "hot" | "time";
}): Promise<ArtistSongsPage> {
  return await invokeCachedCommand("get_artist_songs", args);
}

export async function getArtistTopSongs(args: {
  id: string;
  limit: number;
}): Promise<ArtistSongsResult> {
  return await invokeCachedCommand("get_artist_top_songs", args);
}

export async function getSongLyric(args: { id: string }): Promise<string> {
  return await invokeCachedCommand("get_song_lyric", args);
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

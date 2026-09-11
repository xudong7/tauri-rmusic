import type {
  AlbumDetailResult,
  AlbumSearchResult,
  ArtistAlbumResult,
  ArtistDetailResult,
  ArtistSearchResult,
  ArtistSongsResult,
  ArtistSongsPage,
  MusicFile,
  Playlist,
  PlaylistDetailResult,
  PlaybackSource,
  PlaylistSearchResult,
  PlaylistTracksResult,
  PlayStartResult,
  PlaySongResult,
  OnlineServiceStatus,
  SearchMixResult,
  ToplistResult,
} from "@/types/model";

export type HandleEventAction = "pause" | "recovery" | "volume";

interface PlaybackProgressResult {
  position_ms: number;
  duration_ms: number;
  is_ended: boolean;
}

interface PlaybackStateResult extends PlaybackProgressResult {
  is_paused: boolean;
  has_track: boolean;
  track_id: number;
}

interface SeekResult {
  success: boolean;
  should_play_next: boolean;
}

export interface TauriCommandParamsMap {
  quit_app: void;
  scan_files: { path: string | null; defaultDirectory: string | null };
  load_cached_music_files: { path: string | null; defaultDirectory: string | null };
  control_playback: {
    action: "play" | "pause" | "volume";
    volume: number | null;
  };
  play_track: { source: PlaybackSource; requestId: number };
  prepare_playback_request: { requestId: number };
  prefetch_netease_song: { id: string };
  get_online_audio_cache_size: void;
  get_online_audio_cache_path: void;
  clear_online_audio_cache: void;
  check_online_service_status: void;
  ensure_online_service: void;
  restart_online_service: void;
  play_netease_song: { id: string; name: string; artist: string; picUrl?: string };
  download_music: {
    songHash: string;
    songName: string;
    artist: string;
    defaultDirectory: string | null;
  };
  search_online_mix: {
    keywords: string;
    page: number;
    pagesize: number;
    songLimit?: number;
    artistLimit?: number;
  };
  search_online_playlists: { keywords: string; page: number; pagesize: number };
  search_online_albums: { keywords: string; page: number; pagesize: number };
  search_online_artists: { keywords: string; page: number; pagesize: number };
  get_playlist_detail: { id: string };
  // trackCount 由调用方的 get_playlist_detail 提供，后端据此推导 has_more，
  // 避免翻页时重复请求歌单元数据。
  get_playlist_tracks: {
    id: string;
    offset: number;
    limit: number;
    trackCount: number;
  };
  get_album_detail: { id: string };
  get_toplist: void;
  get_artist_albums: { id: string; page: number; pagesize: number };
  get_artist_detail: { id: string };
  get_artist_songs: {
    id: string;
    page: number;
    pagesize: number;
    order: "hot" | "time";
  };
  get_artist_top_songs: { id: string; limit: number };
  get_default_music_dir: void;
  get_song_lyric: { id: string };
  load_local_cover_path: { fileName: string; defaultDirectory: string | null };
  load_local_lyric: { fileName: string; defaultDirectory: string | null };
  get_playback_state: void;
  import_music: { files: string[]; defaultDirectory: string | null };
  read_playlists: void;
  write_playlists: { playlists: Playlist[] };
  seek_to: { positionMs: number };
}

export interface TauriCommandResultMap {
  quit_app: void;
  scan_files: MusicFile[];
  load_cached_music_files: MusicFile[];
  control_playback: void;
  play_track: PlayStartResult;
  prepare_playback_request: void;
  prefetch_netease_song: void;
  get_online_audio_cache_size: number;
  get_online_audio_cache_path: string;
  clear_online_audio_cache: void;
  check_online_service_status: OnlineServiceStatus;
  ensure_online_service: void;
  restart_online_service: void;
  play_netease_song: PlaySongResult;
  download_music: string;
  search_online_mix: SearchMixResult;
  search_online_playlists: PlaylistSearchResult;
  search_online_albums: AlbumSearchResult;
  search_online_artists: ArtistSearchResult;
  get_playlist_detail: PlaylistDetailResult;
  get_playlist_tracks: PlaylistTracksResult;
  get_album_detail: AlbumDetailResult;
  get_toplist: ToplistResult;
  get_artist_albums: ArtistAlbumResult;
  get_artist_detail: ArtistDetailResult;
  get_artist_songs: ArtistSongsPage;
  get_artist_top_songs: ArtistSongsResult;
  get_default_music_dir: string;
  get_song_lyric: string;
  load_local_cover_path: string | null;
  load_local_lyric: string;
  get_playback_state: PlaybackStateResult;
  import_music: string;
  read_playlists: Playlist[];
  write_playlists: void;
  seek_to: SeekResult;
}

export type TauriCommand = keyof TauriCommandParamsMap & keyof TauriCommandResultMap;
export type TauriCommandParams<C extends TauriCommand> = TauriCommandParamsMap[C];
export type TauriCommandResult<C extends TauriCommand> = TauriCommandResultMap[C];

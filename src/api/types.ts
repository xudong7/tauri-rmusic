import type {
  ArtistSongsResult,
  MusicFile,
  Playlist,
  PlaybackSource,
  PlayStartResult,
  PlaySongResult,
  OnlineServiceStatus,
  SearchMixResult,
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
  handle_event: { event: string };
  play_track: { source: PlaybackSource };
  prefetch_netease_song: { id: string };
  get_online_audio_cache_size: void;
  get_online_audio_cache_path: void;
  clear_online_audio_cache: void;
  check_online_service_status: void;
  restart_online_service: void;
  play_netease_song: { id: string; name: string; artist: string };
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
  get_artist_top_songs: { id: string; limit: number };
  get_default_music_dir: void;
  get_song_lyric: { id: string };
  load_local_cover_path: { fileName: string; defaultDirectory: string | null };
  load_local_lyric: { fileName: string; defaultDirectory: string | null };
  is_sink_empty: void;
  get_playback_state: void;
  import_music: { files: string[]; defaultDirectory: string | null };
  read_playlists: void;
  write_playlists: { playlists: Playlist[] };
  get_progress: void;
  seek_to: { positionMs: number };
}

export interface TauriCommandResultMap {
  quit_app: void;
  scan_files: MusicFile[];
  handle_event: void;
  play_track: PlayStartResult;
  prefetch_netease_song: void;
  get_online_audio_cache_size: number;
  get_online_audio_cache_path: string;
  clear_online_audio_cache: void;
  check_online_service_status: OnlineServiceStatus;
  restart_online_service: void;
  play_netease_song: PlaySongResult;
  download_music: string;
  search_online_mix: SearchMixResult;
  get_artist_top_songs: ArtistSongsResult;
  get_default_music_dir: string;
  get_song_lyric: string;
  load_local_cover_path: string | null;
  load_local_lyric: string;
  is_sink_empty: boolean;
  get_playback_state: PlaybackStateResult;
  import_music: string;
  read_playlists: Playlist[];
  write_playlists: void;
  get_progress: PlaybackProgressResult;
  seek_to: SeekResult;
}

export type TauriCommand = keyof TauriCommandParamsMap & keyof TauriCommandResultMap;
export type TauriCommandParams<C extends TauriCommand> = TauriCommandParamsMap[C];
export type TauriCommandResult<C extends TauriCommand> = TauriCommandResultMap[C];

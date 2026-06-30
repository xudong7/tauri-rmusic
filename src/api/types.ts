import type {
  ArtistSongsResult,
  Playlist,
  PlaybackSource,
  PlayStartResult,
  PlaySongResult,
  OnlineServiceStatus,
  SearchMixResult,
} from "@/types/model";

export type HandleEventAction = "play" | "pause" | "recovery" | "volume";

export type TauriCommand =
  | "scan_files"
  | "handle_event"
  | "play_track"
  | "get_online_audio_cache_size"
  | "get_online_audio_cache_path"
  | "clear_online_audio_cache"
  | "check_online_service_status"
  | "restart_online_service"
  | "play_netease_song"
  | "download_music"
  | "search_online_mix"
  | "get_artist_top_songs"
  | "get_default_music_dir"
  | "get_song_lyric"
  | "load_cover_and_lyric"
  | "load_local_cover_path"
  | "load_local_lyric"
  | "is_sink_empty"
  | "get_playback_state"
  | "import_music"
  | "read_playlists"
  | "write_playlists"
  | "get_progress"
  | "seek_to";

export type TauriCommandParams<C extends TauriCommand> = C extends "scan_files"
  ? { path: string | null; defaultDirectory: string | null }
  : C extends "handle_event"
    ? { event: string }
    : C extends "play_track"
      ? { source: PlaybackSource }
      : C extends "get_online_audio_cache_size"
        ? void
        : C extends "get_online_audio_cache_path"
          ? void
          : C extends "clear_online_audio_cache"
            ? void
            : C extends "check_online_service_status"
              ? void
              : C extends "restart_online_service"
                ? void
                : C extends "play_netease_song"
                  ? { id: string; name: string; artist: string }
                  : C extends "download_music"
                    ? {
                        songHash: string;
                        songName: string;
                        artist: string;
                        defaultDirectory: string | null;
                      }
                    : C extends "search_online_mix"
                      ? {
                          keywords: string;
                          page: number;
                          pagesize: number;
                          songLimit?: number;
                          artistLimit?: number;
                        }
                      : C extends "get_artist_top_songs"
                        ? { id: string; limit: number }
                        : C extends "get_default_music_dir"
                          ? void
                          : C extends "get_song_lyric"
                            ? { id: string }
                            : C extends "load_cover_and_lyric"
                              ? { fileName: string; defaultDirectory: string | null }
                              : C extends "load_local_cover_path"
                                ? { fileName: string; defaultDirectory: string | null }
                                : C extends "load_local_lyric"
                                  ? { fileName: string; defaultDirectory: string | null }
                                  : C extends "is_sink_empty"
                                    ? void
                                    : C extends "get_playback_state"
                                      ? void
                                      : C extends "import_music"
                                        ? {
                                            files: string[];
                                            defaultDirectory: string | null;
                                          }
                                        : C extends "read_playlists"
                                          ? void
                                          : C extends "write_playlists"
                                            ? { playlists: Playlist[] }
                                            : C extends "get_progress"
                                              ? void
                                              : C extends "seek_to"
                                                ? { positionMs: number }
                                                : never;

export type TauriCommandResult<C extends TauriCommand> = C extends "scan_files"
  ? unknown
  : C extends "handle_event"
    ? unknown
    : C extends "play_track"
      ? PlayStartResult
      : C extends "get_online_audio_cache_size"
        ? number
        : C extends "get_online_audio_cache_path"
          ? string
          : C extends "clear_online_audio_cache"
            ? void
            : C extends "check_online_service_status"
              ? OnlineServiceStatus
              : C extends "restart_online_service"
                ? void
                : C extends "play_netease_song"
                  ? PlaySongResult
                  : C extends "download_music"
                    ? string
                    : C extends "search_online_mix"
                      ? SearchMixResult
                      : C extends "get_artist_top_songs"
                        ? ArtistSongsResult
                        : C extends "get_default_music_dir"
                          ? string
                          : C extends "get_song_lyric"
                            ? string
                            : C extends "load_cover_and_lyric"
                              ? [string, string]
                              : C extends "load_local_cover_path"
                                ? string | null
                                : C extends "load_local_lyric"
                                  ? string
                                  : C extends "is_sink_empty"
                                    ? boolean
                                    : C extends "get_playback_state"
                                      ? {
                                          position_ms: number;
                                          duration_ms: number;
                                          is_ended: boolean;
                                          is_paused: boolean;
                                          has_track: boolean;
                                          track_id: number;
                                        }
                                      : C extends "import_music"
                                        ? string
                                        : C extends "read_playlists"
                                          ? Playlist[]
                                          : C extends "write_playlists"
                                            ? void
                                            : C extends "get_progress"
                                              ? {
                                                  position_ms: number;
                                                  duration_ms: number;
                                                  is_ended: boolean;
                                                }
                                              : C extends "seek_to"
                                                ? {
                                                    success: boolean;
                                                    should_play_next: boolean;
                                                  }
                                                : unknown;

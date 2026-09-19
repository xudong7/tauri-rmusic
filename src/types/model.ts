export interface MusicFile {
  id: number;
  file_name: string;
  key?: string;
  relative_path?: string;
  extension?: string;
  modified_ms?: number;
  search_text?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration_ms?: number;
}

export interface SongInfo {
  id: string;
  name: string;
  artists: string[];
  album: string;
  duration: number; // 毫秒
  pic_url: string;
  file_hash: string; // 用于播放的稳定标识
}

// 在线歌单（/toplist、/cloudsearch?type=1000、/playlist/detail 共用）
export interface PlaylistInfo {
  id: string;
  name: string;
  cover_url: string;
  track_count: number;
  play_count: number;
  creator: string;
  description: string;
  update_frequency: string;
}

// 在线专辑（/album、/artist/album、/cloudsearch?type=10 共用）
export interface AlbumInfo {
  id: string;
  name: string;
  pic_url: string;
  size: number;
  artist: string;
  publish_time: number; // 毫秒时间戳，由前端按 locale 格式化
  company: string;
}

export interface PlaylistSearchResult {
  playlists: PlaylistInfo[];
  total: number;
}

export interface AlbumSearchResult {
  albums: AlbumInfo[];
  total: number;
}

export interface ArtistSearchResult {
  artists: ArtistInfo[];
  total: number;
}

export interface PlaylistDetailResult {
  playlist: PlaylistInfo;
}

export interface PlaylistTracksResult {
  songs: SongInfo[];
  /** 由后端依据歌单 trackCount 推导，前端无需自行对齐 */
  has_more: boolean;
}

export interface ToplistResult {
  toplists: PlaylistInfo[];
}

export interface AlbumDetailResult {
  album: AlbumInfo;
  songs: SongInfo[];
}

export interface ArtistAlbumResult {
  albums: AlbumInfo[];
  has_more: boolean;
}

/** 歌手歌曲分页。不含歌手信息——那由 getArtistDetail 单独取一次。 */
export interface ArtistSongsPage {
  songs: SongInfo[];
  total: number;
  has_more: boolean;
}

export interface ArtistDetailResult {
  artist: ArtistInfo;
  album_count: number;
  music_count: number;
}

export type OnlineSearchTab = "song" | "artist" | "album" | "playlist";

/**
 * 在线页面的页签。比 OnlineSearchTab 多一个「排行榜」——
 * 榜单是浏览入口而非搜索结果类型，因此不进搜索 store 的分页状态。
 */
export type OnlineTab = OnlineSearchTab | "toplist";

export interface ArtistInfo {
  id: string;
  name: string;
  pic_url: string;
}

export interface SearchMixResult {
  artists: ArtistInfo[];
  songs: SongInfo[];
  total: number;
}

export interface ArtistSongsResult {
  artist: ArtistInfo;
  songs: SongInfo[];
  total: number;
}

export interface PlaySongResult {
  url: string;
  id: string;
  name: string;
  artist: string;
  pic_url: string;
}

export type PlaybackSource =
  | { type: "local"; path: string }
  | { type: "online"; url: string; cache_key: string };

export interface PlayStartResult {
  position_ms: number;
  duration_ms: number;
  is_paused: boolean;
  has_track: boolean;
  track_id: number;
}

export type PlaybackPhase = "idle" | "resolving" | "buffering";

export interface PlaybackQueueItem {
  key: string;
  title: string;
  artist: string;
  sourceIndex: number;
  isCurrent: boolean;
  disabled?: boolean;
  /** 已知的封面地址（在线歌曲的 pic_url），有值就不必再异步解析 */
  coverUrl?: string;
  /** 本地文件名：封面要经 IPC 异步取，由队列按可见范围调度加载 */
  coverFileName?: string;
}

export interface OnlineServiceStatus {
  available: boolean;
  status_code: number | null;
  message: string;
}

export enum PlayMode {
  SEQUENTIAL = "sequential",
  RANDOM = "random",
  REPEAT_ONE = "repeat-one",
}

export enum ViewMode {
  LOCAL = "local",
  ONLINE = "online",
  PLAYLIST = "playlist",
}

export type SearchScope = "local" | "online" | "playlist";

export type PlaylistItem =
  | { type: "local"; file_name: string }
  | { type: "online"; song: SongInfo };

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
}

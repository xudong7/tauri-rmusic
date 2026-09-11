// 音乐文件模型
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

// 在线音乐信息模型
export interface SongInfo {
  id: string;
  name: string;
  artists: string[]; // 艺术家列表
  album: string; // 专辑名
  duration: number; // 持续时间（毫秒）
  pic_url: string; // 图片URL
  file_hash: string; // 文件哈希值，用于播放
  /**
   * 当前（匿名）状态下是否可播放，由后端依据 fee 字段推导。
   * undefined 表示未知，此时不应当作不可播处理。
   */
  playable?: boolean;
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

export interface ArtistDetailResult {
  artist: ArtistInfo;
  description: string;
  album_count: number;
  music_count: number;
}

/** 在线搜索的分类页签 */
export type OnlineSearchTab = "song" | "artist" | "album" | "playlist";

// 搜索结果模型
export interface SearchResult {
  songs: SongInfo[];
  total: number;
}

// 在线搜索-相关歌手
export interface ArtistInfo {
  id: string;
  name: string;
  pic_url: string;
}

// 在线搜索-综合结果（歌手 + 歌曲）
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

// 歌词信息模型
export interface LyricInfo {
  id: string;
  accesskey: string;
}

// 歌词内容模型
export interface Lyric {
  content: string;
  fmt: string;
  contenttype: number;
  charset: string;
}

// 播放歌曲结果模型
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
}

export interface OnlineServiceStatus {
  available: boolean;
  status_code: number | null;
  message: string;
}

// 播放模式
export enum PlayMode {
  SEQUENTIAL = "sequential", // 顺序播放
  RANDOM = "random", // 随机播放
  REPEAT_ONE = "repeat-one", // 单曲循环
}

// 应用的视图模式
export enum ViewMode {
  LOCAL = "local", // 本地音乐模式
  ONLINE = "online", // 在线音乐模式
  PLAYLIST = "playlist", // 播放列表模式
}

export type SearchScope = "local" | "online" | "playlist";

// 播放列表单项（本地或在线）
export type PlaylistItem =
  | { type: "local"; file_name: string }
  | { type: "online"; song: SongInfo };

// 播放列表
export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
}

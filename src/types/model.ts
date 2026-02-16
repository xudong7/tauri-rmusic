// 音乐文件模型
export interface MusicFile {
  id: number;
  file_name: string;
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
}

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

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

// 应用的视图模式
export enum ViewMode {
  LOCAL = "local", // 本地音乐模式
  ONLINE = "online", // 在线音乐模式
}

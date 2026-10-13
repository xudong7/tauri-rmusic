export type TrackSource = "local" | "online" | "playlist";
export type TrackCoverSource = string | (() => string);

export interface TrackRowModel {
  key: string;
  title: string;
  artist: string;
  album?: string;
  durationLabel?: string;
  /** 歌名/歌手后面的小标签（如「播放 12 次」），不传就不渲染 */
  badge?: string;
  coverUrl: TrackCoverSource;
  source: TrackSource;
  sourceIndex: number;
  disabled?: boolean;
}

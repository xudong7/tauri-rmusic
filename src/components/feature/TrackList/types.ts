export type TrackSource = "local" | "online" | "playlist";
export type TrackCoverSource = string | (() => string);

export interface TrackRowModel {
  key: string;
  title: string;
  artist: string;
  album?: string;
  durationLabel?: string;
  coverUrl: TrackCoverSource;
  source: TrackSource;
  sourceIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  disabled?: boolean;
}

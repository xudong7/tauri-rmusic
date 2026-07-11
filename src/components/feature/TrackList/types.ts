export type TrackSource = "local" | "online" | "playlist";

export interface TrackRowModel {
  key: string;
  title: string;
  artist: string;
  album?: string;
  durationLabel?: string;
  coverUrl: string;
  source: TrackSource;
  sourceIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  disabled?: boolean;
}

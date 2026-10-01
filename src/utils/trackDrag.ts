import type { SongInfo } from "@/types/model";

/**
 * 曲目行拖拽到侧栏歌单用的自定义 MIME。
 *
 * 用自定义类型而不是 text/plain：侧栏只对能识别的载荷亮起，拖文件进来
 * （原生 drag-drop 事件）或拖别的东西不会误触发高亮。
 */
export const TRACK_DRAG_MIME = "application/x-rmusic-track";

export type TrackDragPayload =
  | { type: "local"; fileName: string }
  | { type: "online"; song: SongInfo };

export function writeTrackDragPayload(event: DragEvent, payload: TrackDragPayload): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(TRACK_DRAG_MIME, JSON.stringify(payload));
}

/** 解析拖拽载荷；缺失、损坏或结构不符一律当作没有载荷 */
export function readTrackDragPayload(event: DragEvent): TrackDragPayload | null {
  const raw = event.dataTransfer?.getData(TRACK_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrackDragPayload>;
    if (
      parsed.type === "local" &&
      typeof parsed.fileName === "string" &&
      parsed.fileName
    ) {
      return { type: "local", fileName: parsed.fileName };
    }
    if (parsed.type === "online" && parsed.song && typeof parsed.song.id === "string") {
      return { type: "online", song: parsed.song };
    }
    return null;
  } catch {
    return null;
  }
}

export function hasTrackDragPayload(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(TRACK_DRAG_MIME) ?? false;
}

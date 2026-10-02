import { ref } from "vue";
import type { SongInfo } from "@/types/model";

/**
 * 应用内部的曲目拖拽（歌单排序、拖到侧栏歌单）。
 *
 * 为什么不用 HTML5 drag and drop：Tauri 的原生拖放系统（dragDropEnabled，
 * 文件导入需要它拿真实路径）在 macOS / Windows 上会拦截 DOM 的拖放事件，
 * 行上的 dragstart 根本不会触发。这里改用 pointer 事件自己实现一小套：
 * 超过阈值才算拖拽、document 级跟踪移动、elementFromPoint 找落点。
 */
export type TrackDragPayload =
  | { type: "local"; fileName: string }
  | { type: "online"; song: SongInfo };

export interface TrackDragState {
  payload: TrackDragPayload;
  /** 跟随指针的浮标文字（曲名） */
  label: string;
  x: number;
  y: number;
}

export interface TrackDragOptions {
  payload: TrackDragPayload;
  label: string;
  /** 拖拽中每次移动（已超过阈值）都会回调，用于高亮落点 */
  onMove?: (payload: TrackDragPayload, x: number, y: number) => void;
  /** 指针抬起时回调；是否落在有效区域由发起方判断 */
  onDrop?: (payload: TrackDragPayload, x: number, y: number) => void;
  onCancel?: () => void;
}

/** 位移超过该像素才算拖拽，避免把普通点击误判成拖动 */
const DRAG_THRESHOLD_PX = 6;

const dragging = ref<TrackDragState | null>(null);
let pending: { x: number; y: number; options: TrackDragOptions } | null = null;
let active: TrackDragOptions | null = null;

function addListeners() {
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerCancel);
  // 指针在窗口外抬起时收不到 pointerup：失焦即视为取消，避免拖拽状态卡住
  window.addEventListener("blur", handleWindowBlur);
}

function removeListeners() {
  document.removeEventListener("pointermove", handlePointerMove);
  document.removeEventListener("pointerup", handlePointerUp);
  document.removeEventListener("pointercancel", handlePointerCancel);
  window.removeEventListener("blur", handleWindowBlur);
}

/**
 * 拖拽结束后浏览器还会补一个 click，若落点没变就会触发行的播放。
 * 用一次性捕获监听吞掉它；若这次拖拽没有产生 click，超时后自动摘掉。
 */
function suppressNextClick() {
  const suppress = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  document.addEventListener("click", suppress, { capture: true, once: true });
  window.setTimeout(() => {
    document.removeEventListener("click", suppress, { capture: true });
  }, 0);
}

function startTrackDrag(event: PointerEvent, options: TrackDragOptions) {
  if (event.button !== 0 || pending || active) return;
  pending = { x: event.clientX, y: event.clientY, options };
  addListeners();
}

function handlePointerMove(event: PointerEvent) {
  if (pending) {
    const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
    if (moved < DRAG_THRESHOLD_PX) return;
    active = pending.options;
    pending = null;
    document.body.classList.add("is-track-dragging");
    suppressNextClick();
  }
  if (!active) return;

  dragging.value = {
    payload: active.payload,
    label: active.label,
    x: event.clientX,
    y: event.clientY,
  };
  active.onMove?.(active.payload, event.clientX, event.clientY);
}

function finish(event: PointerEvent | null, dropped: boolean) {
  removeListeners();
  const options = active;
  pending = null;
  active = null;
  if (dragging.value) {
    dragging.value = null;
    document.body.classList.remove("is-track-dragging");
  }
  if (!options) return;
  if (dropped && event) options.onDrop?.(options.payload, event.clientX, event.clientY);
  else options.onCancel?.();
}

function handlePointerUp(event: PointerEvent) {
  finish(event, true);
}

function handlePointerCancel(event: PointerEvent) {
  finish(event, false);
}

function handleWindowBlur() {
  finish(null, false);
}

export function useTrackDrag() {
  return { dragging, startTrackDrag };
}

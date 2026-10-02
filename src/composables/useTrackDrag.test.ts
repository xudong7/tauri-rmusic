import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackDrag, type TrackDragPayload } from "./useTrackDrag";

const payload: TrackDragPayload = { type: "local", fileName: "a.mp3" };

function pointerEvent(type: string, x = 0, y = 0) {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    button: 0,
  }) as unknown as PointerEvent;
}

describe("useTrackDrag", () => {
  beforeEach(() => {
    // 清掉上一条用例可能留下的拖拽状态
    document.dispatchEvent(pointerEvent("pointerup", 0, 0));
    document.body.classList.remove("is-track-dragging");
  });

  it("位移不超过阈值时不算拖拽，抬起也不触发 onDrop", () => {
    const onMove = vi.fn();
    const onDrop = vi.fn();
    const { dragging, startTrackDrag } = useTrackDrag();

    startTrackDrag(pointerEvent("pointerdown", 10, 10), {
      payload,
      label: "Song",
      onMove,
      onDrop,
    });
    document.dispatchEvent(pointerEvent("pointermove", 13, 12));

    expect(dragging.value).toBeNull();
    expect(onMove).not.toHaveBeenCalled();

    document.dispatchEvent(pointerEvent("pointerup", 13, 12));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("超过阈值后跟踪移动，指针抬起触发 onDrop", () => {
    const onMove = vi.fn();
    const onDrop = vi.fn();
    const { dragging, startTrackDrag } = useTrackDrag();

    startTrackDrag(pointerEvent("pointerdown", 10, 10), {
      payload,
      label: "Song",
      onMove,
      onDrop,
    });
    document.dispatchEvent(pointerEvent("pointermove", 30, 30));

    expect(dragging.value).toEqual({ payload, label: "Song", x: 30, y: 30 });
    expect(document.body.classList.contains("is-track-dragging")).toBe(true);
    expect(onMove).toHaveBeenCalledWith(payload, 30, 30);

    document.dispatchEvent(pointerEvent("pointerup", 40, 50));
    expect(onDrop).toHaveBeenCalledWith(payload, 40, 50);
    expect(dragging.value).toBeNull();
    expect(document.body.classList.contains("is-track-dragging")).toBe(false);
  });

  it("pointercancel 走 onCancel，不触发 onDrop", () => {
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    const { startTrackDrag } = useTrackDrag();

    startTrackDrag(pointerEvent("pointerdown", 10, 10), {
      payload,
      label: "Song",
      onDrop,
      onCancel,
    });
    document.dispatchEvent(pointerEvent("pointermove", 40, 40));
    document.dispatchEvent(pointerEvent("pointercancel", 40, 40));

    expect(onDrop).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("拖拽结束后补发的 click 被吞掉，不触发行的播放", () => {
    const { startTrackDrag } = useTrackDrag();
    startTrackDrag(pointerEvent("pointerdown", 10, 10), {
      payload,
      label: "Song",
    });
    document.dispatchEvent(pointerEvent("pointermove", 40, 40));
    document.dispatchEvent(pointerEvent("pointerup", 40, 40));

    const child = document.createElement("div");
    document.body.appendChild(child);
    const clickSpy = vi.fn();
    document.addEventListener("click", clickSpy);
    child.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clickSpy).not.toHaveBeenCalled();
    document.removeEventListener("click", clickSpy);
    child.remove();
  });
});

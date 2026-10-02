import { describe, expect, it } from "vitest";
import type { SongInfo } from "@/types/model";
import {
  hasTrackDragPayload,
  readTrackDragPayload,
  writeTrackDragPayload,
  TRACK_DRAG_MIME,
  type TrackDragPayload,
} from "./trackDrag";

function fakeDragEvent() {
  const store = new Map<string, string>();
  const types: string[] = [];
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    types,
    setData(type: string, value: string) {
      store.set(type, value);
      if (!types.includes(type)) types.push(type);
    },
    getData(type: string) {
      return store.get(type) ?? "";
    },
  };
  return { event: { dataTransfer } as unknown as DragEvent, dataTransfer, store };
}

const song: SongInfo = {
  id: "1",
  name: "Song",
  artists: ["Artist"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "h1",
};

describe("trackDrag", () => {
  it("本地/在线载荷都能写入并原样读回", () => {
    const { event } = fakeDragEvent();
    const localPayload: TrackDragPayload = { type: "local", fileName: "a.mp3" };
    writeTrackDragPayload(event, localPayload);
    expect(hasTrackDragPayload(event)).toBe(true);
    expect(readTrackDragPayload(event)).toEqual(localPayload);

    const onlineEvent = fakeDragEvent().event;
    const onlinePayload: TrackDragPayload = { type: "online", song };
    writeTrackDragPayload(onlineEvent, onlinePayload);
    expect(readTrackDragPayload(onlineEvent)).toEqual(onlinePayload);
  });

  it("没有载荷、损坏 JSON、结构不符时返回 null", () => {
    const { event, store } = fakeDragEvent();
    expect(readTrackDragPayload(event)).toBeNull();
    expect(hasTrackDragPayload(event)).toBe(false);

    store.set(TRACK_DRAG_MIME, "{oops");
    expect(readTrackDragPayload(event)).toBeNull();

    store.set(TRACK_DRAG_MIME, JSON.stringify({ type: "local" }));
    expect(readTrackDragPayload(event)).toBeNull();

    store.set(TRACK_DRAG_MIME, JSON.stringify({ type: "online", song: {} }));
    expect(readTrackDragPayload(event)).toBeNull();
  });
});

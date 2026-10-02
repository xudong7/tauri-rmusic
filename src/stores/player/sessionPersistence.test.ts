import { describe, expect, it } from "vitest";
import { PLAYER_SESSION_VERSION } from "@/constants";
import {
  parsePlayerSession,
  windowQueue,
  type PlayerSessionSnapshot,
} from "./sessionPersistence";
import type { SongInfo } from "@/types/model";

function sessionOf(overrides: Partial<PlayerSessionSnapshot> = {}): string {
  return JSON.stringify({
    version: PLAYER_SESSION_VERSION,
    positionMs: 0,
    playlistId: null,
    localKey: null,
    onlineSong: null,
    localQueueKeys: [],
    onlineQueue: [],
    ...overrides,
  });
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

describe("parsePlayerSession", () => {
  it("空值与损坏的 JSON 都当作没有会话", () => {
    expect(parsePlayerSession(null)).toBeNull();
    expect(parsePlayerSession("")).toBeNull();
    expect(parsePlayerSession("{oops")).toBeNull();
  });

  it("版本不符时丢弃（字段可能不兼容）", () => {
    const raw = JSON.stringify({
      version: PLAYER_SESSION_VERSION + 1,
      localKey: "a.mp3",
    });
    expect(parsePlayerSession(raw)).toBeNull();
  });

  it("既没有本地键也没有在线曲目时丢弃", () => {
    expect(parsePlayerSession(sessionOf())).toBeNull();
  });

  it("负进度归零，非法队列项被过滤", () => {
    const raw = JSON.stringify({
      version: PLAYER_SESSION_VERSION,
      positionMs: -500,
      playlistId: "",
      localKey: "a.mp3",
      onlineSong: { id: "" },
      localQueueKeys: ["a.mp3", 3, ""],
      onlineQueue: [{ id: "1", name: "ok", artists: [] }, "bad", { id: "2" }],
    });
    const parsed = parsePlayerSession(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.positionMs).toBe(0);
    expect(parsed!.playlistId).toBeNull();
    expect(parsed!.onlineSong).toBeNull();
    expect(parsed!.localQueueKeys).toEqual(["a.mp3"]);
    expect(parsed!.onlineQueue.map((item) => item.id)).toEqual(["1"]);
  });

  it("完整会话原样解析", () => {
    const parsed = parsePlayerSession(
      sessionOf({
        positionMs: 1234,
        playlistId: "pl_1",
        localKey: "a.mp3",
        onlineSong: song,
        localQueueKeys: ["a.mp3", "b.mp3"],
        onlineQueue: [song],
      })
    );
    expect(parsed).toEqual({
      version: PLAYER_SESSION_VERSION,
      positionMs: 1234,
      playlistId: "pl_1",
      localKey: "a.mp3",
      onlineSong: song,
      localQueueKeys: ["a.mp3", "b.mp3"],
      onlineQueue: [song],
    });
  });
});

describe("windowQueue", () => {
  it("队列不超限时原样返回一份拷贝", () => {
    const queue = [1, 2, 3];
    const result = windowQueue(queue, 1, 10);
    expect(result).toEqual(queue);
    expect(result).not.toBe(queue);
  });

  it("超限时保留当前项两侧的一段，当前项仍在窗口里", () => {
    const queue = Array.from({ length: 100 }, (_, index) => index);
    const result = windowQueue(queue, 50, 20);
    expect(result).toHaveLength(20);
    expect(result).toContain(50);
    expect(result[0]).toBe(40);
  });

  it("当前项指数组头部或尾部时窗口贴边，不越界", () => {
    const queue = Array.from({ length: 100 }, (_, index) => index);
    const tail = windowQueue(queue, 99, 20);
    expect(windowQueue(queue, 0, 20)[0]).toBe(0);
    expect(tail[tail.length - 1]).toBe(99);
    // 找不到当前项（-1）时从头部取
    expect(windowQueue(queue, -1, 20)[0]).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { MusicFile } from "@/types/model";
import {
  groupMusicFilesByAlbum,
  groupMusicFilesByArtist,
  parseStoredSortMode,
  sortMusicFiles,
} from "./libraryGroups";

function file(overrides: Partial<MusicFile> & { file_name: string }): MusicFile {
  return {
    id: Math.random(),
    key: overrides.file_name,
    relative_path: overrides.file_name,
    ...overrides,
  };
}

describe("groupMusicFilesByAlbum", () => {
  it("同名专辑不区分大小写地合并，歌手取第一个非空标签", () => {
    const groups = groupMusicFilesByAlbum([
      file({ file_name: "1.mp3", album: "Album A", artist: "", duration_ms: 100 }),
      file({ file_name: "2.mp3", album: "album a", artist: "Artist", duration_ms: 200 }),
      file({ file_name: "3.mp3", album: "Album B", artist: "Artist", duration_ms: 50 }),
    ]);

    expect(groups).toHaveLength(2);
    const albumA = groups.find((group) => group.name === "Album A");
    expect(albumA?.tracks.map((track) => track.file_name)).toEqual(["1.mp3", "2.mp3"]);
    expect(albumA?.artist).toBe("Artist");
    expect(albumA?.durationMs).toBe(300);
  });

  it("缺失/空白专辑归入同一个未知组并排在最后", () => {
    const groups = groupMusicFilesByAlbum([
      file({ file_name: "no-album.mp3" }),
      file({ file_name: "blank.mp3", album: "  " }),
      file({ file_name: "real.mp3", album: "Z Album" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("Z Album");
    expect(groups[1].name).toBe("");
    expect(groups[1].tracks).toHaveLength(2);
    expect(groups[1].key).not.toBe(groups[0].key);
  });

  it("addedMs 取组内最新修改时间", () => {
    const groups = groupMusicFilesByAlbum([
      file({ file_name: "1.mp3", album: "A", modified_ms: 10 }),
      file({ file_name: "2.mp3", album: "A", modified_ms: 99 }),
    ]);
    expect(groups[0].addedMs).toBe(99);
  });
});

describe("groupMusicFilesByArtist", () => {
  it("多歌手标签（A / B）各自成组，同曲计入两边", () => {
    const groups = groupMusicFilesByArtist([
      file({ file_name: "1.mp3", artist: "A / B", album: "Album" }),
      file({ file_name: "2.mp3", artist: "A", album: "Other" }),
    ]);

    const a = groups.find((group) => group.name === "A");
    const b = groups.find((group) => group.name === "B");
    expect(a?.tracks).toHaveLength(2);
    expect(a?.albumCount).toBe(2);
    expect(b?.tracks).toHaveLength(1);
    expect(b?.albumCount).toBe(1);
  });

  it("缺失歌手标签归入未知组并排在最后", () => {
    const groups = groupMusicFilesByArtist([
      file({ file_name: "1.mp3" }),
      file({ file_name: "2.mp3", artist: "Artist" }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Artist", ""]);
  });
});

describe("sortMusicFiles", () => {
  const files = [
    file({
      file_name: "b.mp3",
      title: "Beta",
      artist: "Zed",
      album: "M",
      duration_ms: 200,
      modified_ms: 1,
    }),
    file({
      file_name: "a.mp3",
      title: "Alpha",
      artist: "Ann",
      album: "N",
      duration_ms: 300,
      modified_ms: 5,
    }),
    file({ file_name: "no-meta.mp3", duration_ms: 100, modified_ms: 3 }),
  ];

  it("default 保持原顺序", () => {
    expect(sortMusicFiles(files, "default").map((item) => item.file_name)).toEqual([
      "b.mp3",
      "a.mp3",
      "no-meta.mp3",
    ]);
  });

  it("按标题排序，缺标签时退回文件名", () => {
    expect(sortMusicFiles(files, "title").map((item) => item.file_name)).toEqual([
      "a.mp3",
      "b.mp3",
      "no-meta.mp3",
    ]);
  });

  it("按歌手/专辑排序时缺失值排在最后", () => {
    expect(sortMusicFiles(files, "artist").map((item) => item.artist ?? "")).toEqual([
      "Ann",
      "Zed",
      "",
    ]);
    expect(sortMusicFiles(files, "album").map((item) => item.album ?? "")).toEqual([
      "M",
      "N",
      "",
    ]);
  });

  it("时长升序、最近添加降序", () => {
    expect(sortMusicFiles(files, "duration").map((item) => item.file_name)).toEqual([
      "no-meta.mp3",
      "b.mp3",
      "a.mp3",
    ]);
    expect(sortMusicFiles(files, "added").map((item) => item.file_name)).toEqual([
      "a.mp3",
      "no-meta.mp3",
      "b.mp3",
    ]);
  });

  it("返回新数组，不修改原数组", () => {
    const original = [...files];
    sortMusicFiles(files, "title");
    expect(files).toEqual(original);
  });
});

describe("排序持久化解析", () => {
  it("parseStoredSortMode 兼容字符串、历史 JSON 与损坏值", () => {
    expect(parseStoredSortMode(null)).toBe("default");
    expect(parseStoredSortMode("artist")).toBe("artist");
    expect(
      parseStoredSortMode(JSON.stringify({ mode: "album", direction: "desc" }))
    ).toBe("album");
    expect(parseStoredSortMode("{oops")).toBe("default");
    expect(parseStoredSortMode(JSON.stringify({ mode: "nope" }))).toBe("default");
  });

  it("最近添加默认新的在前", () => {
    const files = [
      file({ file_name: "a.mp3", modified_ms: 1 }),
      file({ file_name: "b.mp3", modified_ms: 2 }),
    ];
    expect(sortMusicFiles(files, "added").map((item) => item.file_name)).toEqual([
      "b.mp3",
      "a.mp3",
    ]);
  });
});

describe("专辑内按碟号/曲序排序", () => {
  it("先按碟号再按曲序，缺失的排在碟内末尾", () => {
    const groups = groupMusicFilesByAlbum([
      file({ file_name: "b2.mp3", album: "A", track_number: 2 }),
      file({ file_name: "a1.mp3", album: "A", track_number: 1 }),
      file({ file_name: "no-tag.mp3", album: "A" }),
      file({ file_name: "disc2-1.mp3", album: "A", disc_number: 2, track_number: 1 }),
      file({ file_name: "b10.mp3", album: "A", track_number: 10 }),
    ]);

    expect(groups[0].tracks.map((track) => track.file_name)).toEqual([
      "a1.mp3",
      "b2.mp3",
      "b10.mp3",
      "no-tag.mp3",
      "disc2-1.mp3",
    ]);
  });

  it("完全没有标签时保持扫描顺序", () => {
    const groups = groupMusicFilesByAlbum([
      file({ file_name: "x.mp3", album: "A" }),
      file({ file_name: "y.mp3", album: "A" }),
    ]);
    expect(groups[0].tracks.map((track) => track.file_name)).toEqual(["x.mp3", "y.mp3"]);
  });
});

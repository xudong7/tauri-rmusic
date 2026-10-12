import { describe, expect, it } from "vitest";
import type { MusicFile } from "@/types/model";
import { buildM3u, matchM3uEntries, parseM3u } from "./m3u";

function file(name: string, relative?: string): MusicFile {
  return {
    id: 1,
    file_name: name,
    key: name,
    relative_path: relative ?? name,
    extension: "mp3",
    modified_ms: 1,
    search_text: name,
  };
}

describe("parseM3u", () => {
  it("EXTINF 与路径行配对，注释与空行忽略", () => {
    const entries = parseM3u(
      [
        "#EXTM3U",
        "# 注释",
        "",
        "#EXTINF:214,Artist - Song",
        "/music/Artist - Song.mp3",
        "#EXTINF:-1,No Duration",
        "C:\\Music\\Other.flac",
      ].join("\n")
    );

    expect(entries).toEqual([
      { path: "/music/Artist - Song.mp3", title: "Artist - Song", durationMs: 214000 },
      { path: "C:\\Music\\Other.flac", title: "No Duration" },
    ]);
  });

  it("没有 EXTINF 的裸路径也算一条", () => {
    expect(parseM3u("#EXTM3U\n/only/path.mp3\n").map((entry) => entry.path)).toEqual([
      "/only/path.mp3",
    ]);
  });

  it("CRLF 换行同样能解析", () => {
    const entries = parseM3u("#EXTM3U\r\n#EXTINF:10,T\r\n/a.mp3\r\n");
    expect(entries).toEqual([{ path: "/a.mp3", title: "T", durationMs: 10000 }]);
  });

  it("EXTINF 后面没有路径时该条丢弃", () => {
    expect(parseM3u("#EXTINF:10,Orphan\n")).toEqual([]);
  });
});

describe("buildM3u", () => {
  it("写出头、EXTINF 与路径，时长未知写 -1", () => {
    const text = buildM3u([
      { path: "/a.mp3", title: "A", durationMs: 65000 },
      { path: "/b.mp3", title: "B" },
    ]);

    expect(text).toBe("#EXTM3U\n#EXTINF:65,A\n/a.mp3\n#EXTINF:-1,B\n/b.mp3\n");
  });

  it("生成的文本能被自己解析回来", () => {
    const text = buildM3u([{ path: "/a.mp3", title: "A", durationMs: 65000 }]);
    expect(parseM3u(text)).toEqual([{ path: "/a.mp3", title: "A", durationMs: 65000 }]);
  });
});

describe("matchM3uEntries", () => {
  const files = [file("A - One.mp3"), file("Two.mp3", "sub/Two.mp3")];

  it("优先按绝对路径匹配", () => {
    const result = matchM3uEntries(
      [{ path: "/library/A - One.mp3" }, { path: "/library/sub/Two.mp3" }],
      files,
      "/library"
    );
    expect(result.matched.map((item) => item.file_name)).toEqual([
      "A - One.mp3",
      "Two.mp3",
    ]);
    expect(result.missing).toBe(0);
  });

  it("路径对不上时退回按文件名匹配（别人导出的列表）", () => {
    const result = matchM3uEntries(
      [{ path: "D:\\Someone\\Else\\Two.mp3" }],
      files,
      "/library"
    );
    expect(result.matched.map((item) => item.file_name)).toEqual(["Two.mp3"]);
  });

  it("匹配不上的计入 missing，重复项只收一次", () => {
    const result = matchM3uEntries(
      [
        { path: "/library/A - One.mp3" },
        { path: "/library/A - One.mp3" },
        { path: "/nowhere/Ghost.mp3" },
      ],
      files,
      "/library"
    );
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toBe(1);
  });
});

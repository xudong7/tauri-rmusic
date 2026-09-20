import { describe, expect, it } from "vitest";
import { extractArtistName, extractSongTitle } from "./songUtils";

describe("extractSongTitle / extractArtistName", () => {
  it("按「歌手 - 歌曲」切分", () => {
    expect(extractSongTitle("Daoko - TOKYO-KICK-ASS")).toBe("TOKYO-KICK-ASS");
    expect(extractArtistName("Daoko - TOKYO-KICK-ASS")).toBe("Daoko");
  });

  // 歌名里的连字符不是分隔符：TOKYO-KICK-ASS 曾被切成 KICK-ASS
  it("两侧没有空格的连字符留在歌名里", () => {
    expect(extractSongTitle("TOKYO-KICK-ASS")).toBe("TOKYO-KICK-ASS");
    expect(extractArtistName("TOKYO-KICK-ASS")).toBe("");
  });

  it("没有分隔符时歌名原样返回、歌手为空", () => {
    expect(extractSongTitle("Song")).toBe("Song");
    expect(extractArtistName("Song")).toBe("");
  });

  it("多个分隔符只切第一个", () => {
    expect(extractSongTitle("Artist - Title - Live")).toBe("Title - Live");
  });
});

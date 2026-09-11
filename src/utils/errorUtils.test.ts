import { describe, expect, it } from "vitest";
import { TauriCommandError } from "@/api/client";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "./errorUtils";

const t = i18n.global.t;

describe("parseErrorMessage", () => {
  it("maps a file-exists error to a message naming the file", () => {
    const error = new TauriCommandError(
      "download_music",
      "file already exists: /music/Artist - Song.mp3"
    );
    expect(parseErrorMessage(error)).toBe(
      t("errors.fileAlreadyExistsWithPath", { fileName: "Artist - Song.mp3" })
    );
  });

  it("maps network failures to a connection hint", () => {
    const error = new TauriCommandError("search_songs", "API request error: timeout");
    expect(parseErrorMessage(error)).toBe(t("errors.networkError"));
  });

  // 关键回归点：这些技术串曾经被直接拼进 ElMessage 展示给用户，
  // 中文界面下会突然冒出一段英文，而且对用户没有任何指导意义。
  it.each([
    ["Empty song URL"],
    ["Data array is empty"],
    ["API return error: code 404"],
    ["TauriCommandError: API request error: HTTP 502"],
  ])("never surfaces the raw technical message: %s", (raw) => {
    const message = parseErrorMessage(new TauriCommandError("play_netease_song", raw));
    expect(message).not.toContain(raw);
    expect(message).not.toContain("TauriCommandError");
    expect(message).not.toContain("[tauri] invoke");
  });

  it("does not leak a plain Error's message either", () => {
    expect(parseErrorMessage(new Error("Online service is unavailable"))).toBe(
      t("errors.unknownError")
    );
  });

  it("handles non-Error values", () => {
    expect(parseErrorMessage("boom")).toBe(t("errors.unknownError"));
    expect(parseErrorMessage(null)).toBe(t("errors.unknownError"));
    expect(parseErrorMessage(undefined)).toBe(t("errors.unknownError"));
  });
});

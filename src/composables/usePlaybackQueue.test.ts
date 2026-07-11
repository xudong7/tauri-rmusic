import { describe, expect, it, vi } from "vitest";
import { PlayMode, ViewMode, type SongInfo } from "@/types/model";
import { usePlaybackQueue } from "./usePlaybackQueue";

function song(id: string): SongInfo {
  return {
    id,
    name: id,
    artists: ["Artist"],
    album: "Album",
    duration: 1000,
    pic_url: "",
    file_hash: id,
  };
}

describe("usePlaybackQueue", () => {
  it("prefetches the next song once", async () => {
    const queue = [song("1"), song("2"), song("3")];
    const prefetch = vi.fn().mockResolvedValue(undefined);
    const playbackQueue = usePlaybackQueue({
      getPlayMode: () => PlayMode.SEQUENTIAL,
      getViewMode: () => ViewMode.ONLINE,
      getFallbackOnlineQueue: () => queue,
      getCurrentPlaylistId: () => null,
      setCurrentPlaylistId: vi.fn(),
      getPlaylist: () => undefined,
      prefetchOnlineSong: prefetch,
    });

    playbackQueue.applyOnlinePlaybackContext({ queue });
    await playbackQueue.prefetchNextOnlineSong(queue[0]);
    await playbackQueue.prefetchNextOnlineSong(queue[0]);

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("2");
  });

  it("does not prefetch in repeat-one mode", async () => {
    const queue = [song("1"), song("2")];
    const prefetch = vi.fn().mockResolvedValue(undefined);
    const playbackQueue = usePlaybackQueue({
      getPlayMode: () => PlayMode.REPEAT_ONE,
      getViewMode: () => ViewMode.ONLINE,
      getFallbackOnlineQueue: () => queue,
      getCurrentPlaylistId: () => null,
      setCurrentPlaylistId: vi.fn(),
      getPlaylist: () => undefined,
      prefetchOnlineSong: prefetch,
    });

    await playbackQueue.prefetchNextOnlineSong(queue[0]);
    expect(prefetch).not.toHaveBeenCalled();
  });
});

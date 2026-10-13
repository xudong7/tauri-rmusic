import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAY_HISTORY_MAX_ITEMS, STORAGE_KEY_PLAY_HISTORY } from "@/constants";
import type { SongInfo } from "@/types/model";
import { usePlayHistoryStore } from "./playHistoryStore";

function song(id: string): SongInfo {
  return {
    id,
    name: `Song ${id}`,
    artists: ["Artist"],
    album: "Album",
    duration: 1000,
    pic_url: "",
    file_hash: `h${id}`,
  };
}

function local(fileName: string) {
  return { file_name: fileName, title: `Title ${fileName}`, artist: "Artist" };
}

describe("playHistoryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("记录本地与在线曲目，最近播放按时间倒序", () => {
    // Date.now 固定递增：同一毫秒内的多次记录也要有确定顺序
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));

    const store = usePlayHistoryStore();
    store.recordPlay({ source: "local", local: local("a.mp3") });
    store.recordPlay({ source: "online", online: song("42") });

    expect(store.recentEntries.map((entry) => entry.key)).toEqual([
      "online:42",
      "local:a.mp3",
    ]);
    expect(store.recentEntries[0].playCount).toBe(1);
  });

  it("同一首重复播放只更新计数与时间，不新增条目", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));

    const store = usePlayHistoryStore();
    store.recordPlay({ source: "local", local: local("a.mp3") });
    store.recordPlay({ source: "local", local: local("a.mp3") });
    store.recordPlay({ source: "online", online: song("42") });

    expect(store.entries).toHaveLength(2);
    expect(store.mostPlayedEntries[0].key).toBe("local:a.mp3");
    expect(store.mostPlayedEntries[0].playCount).toBe(2);
  });

  it("超出上限时丢掉最旧的条目", () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1));

    const store = usePlayHistoryStore();
    for (let i = 0; i < PLAY_HISTORY_MAX_ITEMS + 5; i++) {
      store.recordPlay({ source: "online", online: song(String(i)) });
    }

    expect(store.entries).toHaveLength(PLAY_HISTORY_MAX_ITEMS);
    // 最早那几条已经不在
    expect(store.entries.some((entry) => entry.key === "online:0")).toBe(false);
    expect(store.entries.some((entry) => entry.key === "online:4")).toBe(false);
    expect(
      store.entries.some((entry) => entry.key === `online:${PLAY_HISTORY_MAX_ITEMS + 4}`)
    ).toBe(true);
  });

  it("落盘后可被新实例读回，清空后不残留", () => {
    const store = usePlayHistoryStore();
    store.recordPlay({ source: "online", online: song("7") });
    expect(localStorage.getItem(STORAGE_KEY_PLAY_HISTORY)).toBeTruthy();

    // 同一份 pinia 里再取一次拿到的是同一个实例；换一份模拟重启
    setActivePinia(createPinia());
    const reloaded = usePlayHistoryStore();
    expect(reloaded.entries.map((entry) => entry.key)).toEqual(["online:7"]);

    reloaded.clearHistory();
    expect(reloaded.entries).toHaveLength(0);
    setActivePinia(createPinia());
    expect(usePlayHistoryStore().entries).toHaveLength(0);
  });
});

import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayMode, type SongInfo } from "@/types/model";
import { usePlayerStore } from "@/stores/playerStore";
import { useDetailPlayback } from "./useDetailPlayback";

const songs: SongInfo[] = ["a", "b", "c"].map((id, i) => ({
  id,
  name: `Song ${id}`,
  artists: ["Artist"],
  album: "Album",
  duration: 1000 + i,
  pic_url: "",
  file_hash: `h${id}`,
}));

function mountPlayback(list: SongInfo[] = songs) {
  let api!: ReturnType<typeof useDetailPlayback>;
  const Harness = defineComponent({
    setup() {
      api = useDetailPlayback(() => list);
      return () => null;
    },
  });
  const pinia = createPinia();
  mount(Harness, { global: { plugins: [pinia] } });
  const playerStore = usePlayerStore(pinia);
  const playOnlineSong = vi
    .spyOn(playerStore, "playOnlineSong")
    .mockResolvedValue("played");
  return { ...api, playerStore, playOnlineSong };
}

describe("useDetailPlayback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("播放全部：从第一首开始，队列是整份列表", () => {
    const { playAll, playOnlineSong } = mountPlayback();

    playAll();

    expect(playOnlineSong).toHaveBeenCalledWith(songs[0], { queue: songs });
  });

  // 打乱的只是这一份队列，全局播放模式是用户自己的选择——在详情页点一下
  // 就把它悄悄改掉，播放栏上的模式图标就不可信了。
  it("随机播放：队列仍是整份列表、顺序被打乱，且不动全局播放模式", () => {
    // 固定随机数让 Fisher-Yates 走出确定的顺序：对 [a,b,c] 得到 [b,c,a]
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { shuffleAll, playOnlineSong, playerStore } = mountPlayback();
    const modeBefore = playerStore.playMode;

    shuffleAll();

    const [played, options] = playOnlineSong.mock.calls[0];
    const queue = (options as { queue: SongInfo[] }).queue;
    expect(queue.map((song) => song.id)).toEqual(["b", "c", "a"]);
    // 播的是打乱后的第一首，否则"随机播放"就没有兑现
    expect(played).toBe(queue[0]);
    expect(playerStore.playMode).toBe(modeBefore);
    expect(modeBefore).toBe(PlayMode.SEQUENTIAL);
  });

  it("随机播放不改动传进来的原数组", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const original = [...songs];
    const { shuffleAll } = mountPlayback(original);

    shuffleAll();

    expect(original.map((song) => song.id)).toEqual(["a", "b", "c"]);
  });

  it("列表为空时什么都不播", () => {
    const { playAll, shuffleAll, playOnlineSong } = mountPlayback([]);

    playAll();
    shuffleAll();

    expect(playOnlineSong).not.toHaveBeenCalled();
  });
});

import { usePlayerStore } from "@/stores/playerStore";
import type { SongInfo } from "@/types/model";

/**
 * 详情页头部的「播放全部 / 随机播放」。
 *
 * 抽出来是因为专辑页与歌单页要做同一件事：把整份列表当队列播起来。
 * 列表由调用方给（各页的 store 不同），这里只管怎么播。
 */
export function useDetailPlayback(getSongs: () => SongInfo[]) {
  const playerStore = usePlayerStore();

  /** 按列表原顺序从头播 */
  function playAll() {
    const songs = getSongs();
    if (songs.length === 0) return;
    void playerStore.playOnlineSong(songs[0], { queue: songs });
  }

  /**
   * 打乱后从头播。
   *
   * 刻意不动全局播放模式：那个开关是用户自己的选择，在详情页点一下"随机播放"
   * 就把它悄悄改成随机，会让播放栏上的模式图标变得不可信。这里打乱的只是
   * 这支队列表本身，之后"下一首"沿着新的顺序走——也正是用户想要的。
   */
  function shuffleAll() {
    const songs = getSongs();
    if (songs.length === 0) return;
    const shuffled = [...songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    void playerStore.playOnlineSong(shuffled[0], { queue: shuffled });
  }

  return { playAll, shuffleAll };
}

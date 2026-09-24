import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { SongInfo } from "@/types/model";
import { downloadMusic } from "@/api/commands/music";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getExpectedDownloadFileName, getLocalFileNameForSong } from "@/utils/songUtils";
import { useLocalMusicStore } from "./localMusicStore";

/**
 * store 内部记的状态。
 *
 * done 与 downloaded 的差别只是「多久以前」：done 是刚下完的闪现，稍后转成
 * downloaded，两者在界面上先后是打勾与「已在曲库」。之所以分开，是因为前者
 * 要常驻可见（成功提示已经没有 toast 兜底了），后者与以前下载的歌一样只在
 * 悬停时显示——同一件事在界面上不该有两套规矩。
 */
export type DownloadStatus = "downloading" | "done" | "failed" | "downloaded";

/** 行上最终展示的状态。 */
export type DownloadState = "downloading" | "done" | "failed" | "inLibrary" | "idle";

/**
 * 打勾常驻的时长。到点后这一行归位成「已在曲库」，从此与以前下载的完全一样：
 * 同一个图标、同样要悬停才显示。
 */
export const DONE_FLASH_MS = 1600;

/**
 * 下载状态。
 *
 * 放在 store 而不是 useOnlinePlaylistActions 里：那个 composable 在
 * OnlineMusicView / ArtistView / OnlineAlbumView / OnlinePlaylistView 里
 * 各自实例化，写在里面的 ref 切页就丢——而下载是跨视图的同一件事。
 */
export const useDownloadStore = defineStore("download", () => {
  const localStore = useLocalMusicStore();

  /**
   * key 为 song.file_hash：下载请求与在线音频缓存都在用的稳定标识。
   * 整体替换而非原地增删，响应式更可预测。
   */
  const statuses = ref<Record<string, DownloadStatus>>({});

  /**
   * 同一首歌的下载只跑一次：后到的调用复用这个 promise。
   *
   * 既是防重复点击，也修掉一个既有问题：在下载中点「加入歌单」会对同一首歌
   * 发两次 download_music，第二次以 "file already exists" 收场。
   * 非响应式——promise 不该被 reactive 包一层，写法同 localMusicStore 的
   * initializePromise。
   */
  const inflight = new Map<string, Promise<string | null>>();

  function isAlreadyExistsError(error: unknown): boolean {
    return String(error ?? "").includes("file already exists");
  }

  function setStatus(key: string, status: DownloadStatus) {
    statuses.value = { ...statuses.value, [key]: status };
  }

  const doneTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * 打勾闪一下：常驻可见一小段时间（成功提示已经没有 toast 兜底了，
   * 操作簇默认悬停才显示，不钉住的话鼠标一移开就什么都看不到），
   * 到点后降级成 downloaded —— 也就是归位成「已在曲库」的样子。
   */
  function flashDone(key: string) {
    setStatus(key, "done");
    const running = doneTimers.get(key);
    if (running) clearTimeout(running);
    doneTimers.set(
      key,
      setTimeout(() => {
        doneTimers.delete(key);
        // 只降级、不清空：清空会让这一行回到「只认曲库」的判定，而那次重扫
        // 不保证一定落地（见 statusFor）。闪现期间用户又点了一次的话，
        // 状态已经是 downloading，这里不能覆盖。
        if (statuses.value[key] === "done") setStatus(key, "downloaded");
      }, DONE_FLASH_MS)
    );
  }

  /**
   * 下载后刷新曲库。
   *
   * 两条分支对应原先两个调用点各自的行为，不能合并成一条：
   * currentDirectory 为空时 refreshCurrentDirectory 是空操作，而「曲库还没
   * 初始化」的场景恰恰要落到 loadMusicFiles —— 它会去后端解析默认目录。
   * 两者都在内部自己消化错误并提示，不会往外抛。
   */
  async function refreshLibrary() {
    if (localStore.currentDirectory) await localStore.refreshCurrentDirectory();
    else await localStore.loadMusicFiles();
  }

  /** 解析出实际入库的文件名：下载目录可能带子目录，只有曲库知道全名。 */
  function resolveFileName(song: SongInfo, fallback: string): string {
    return getLocalFileNameForSong(song, localStore.musicFiles) ?? fallback;
  }

  async function runDownload(song: SongInfo): Promise<string | null> {
    const key = song.file_hash;
    try {
      const downloaded = await downloadMusic({
        songHash: key,
        songName: song.name,
        artist: song.artists.join(", "),
        defaultDirectory: localStore.defaultDirectory,
      });
      await refreshLibrary();
      flashDone(key);
      return resolveFileName(song, downloaded);
    } catch (error) {
      // 文件已经在磁盘上，这是幂等的成功而不是失败：原先它会弹一句
      // 「文件已存在，无需重复下载」的错误提示，而用户要的结果已经达成了。
      if (isAlreadyExistsError(error)) {
        await refreshLibrary();
        flashDone(key);
        return resolveFileName(song, getExpectedDownloadFileName(song));
      }
      console.error("下载歌曲失败:", error);
      ElMessage.error(parseErrorMessage(error));
      setStatus(key, "failed");
      return null;
    }
  }

  /** 返回下载后的文件名；失败返回 null（错误提示已在内部弹出）。 */
  function download(song: SongInfo): Promise<string | null> {
    const key = song.file_hash;
    const running = inflight.get(key);
    if (running) return running;

    setStatus(key, "downloading");
    const promise = runDownload(song).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  }

  /**
   * 行上要展示的状态。优先级：下载中 > 刚下完 > 已下载 > 失败 > 空闲。
   *
   * 「已下载」有两个来源，同一个展示：本次会话下过的（downloaded），以及
   * 曲库里探到的（inLibrary）。之所以不只认曲库：重扫有可能被并发的另一次
   * 加载顶掉（localMusicStore 的 requestId 守卫会静默丢弃结果），那时刚下好
   * 的行会闪回下载箭头，而它明明就在磁盘上。
   *
   * 「已下载」排在 failed 之前：文件就在曲库里却显示「重试」是错的，那个
   * 操作也没有意义。
   *
   * 读的是响应式状态，在渲染中调用即可正确追踪（写法同 MusicList 的
   * getDisplayInfo），不做记忆化。
   */
  function statusFor(song: SongInfo): DownloadState {
    const status = statuses.value[song.file_hash];
    if (status === "downloading") return "downloading";
    if (status === "done") return "done";
    if (status === "downloaded") return "inLibrary";
    if (localStore.hasMusicFile(getExpectedDownloadFileName(song))) return "inLibrary";
    if (status === "failed") return "failed";
    return "idle";
  }

  return {
    download,
    statusFor,
  };
});

/** 需要让行的操作簇常驻的状态：进行中、刚完成、待重试。
 *  inLibrary 不在其中——那是环境状态，常驻反而让每个下过的行都多出两个按钮。 */
export function pinsRowActions(state: DownloadState): boolean {
  return state !== "idle" && state !== "inLibrary";
}

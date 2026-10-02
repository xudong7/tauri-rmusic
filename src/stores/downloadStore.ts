import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { SongInfo } from "@/types/model";
import { MAX_DOWNLOAD_SOURCES, STORAGE_KEY_DOWNLOAD_SOURCES } from "@/constants";
import { downloadMusic } from "@/api/commands/music";
import { parseErrorMessage } from "@/utils/errorUtils";
import {
  readJsonFromStorage,
  trimRecordToLimit,
  writeJsonToStorage,
} from "@/utils/storage";
import { getExpectedDownloadFileName, getLocalFileNameForSong } from "@/utils/songUtils";
import { useLocalMusicStore } from "./localMusicStore";

/** 会话内需要记着的下载状态。inLibrary 不在这里——它由曲库派生，见 statusFor。 */
export type DownloadStatus = "downloading" | "done" | "failed";

/**
 * 行上最终展示的状态。
 *
 * 内部记着 done 与「曲库里已有」两件事，但对外的状态**只有一种「已下载」**：
 * 两者的区别只是「什么时候下的」，而那是时间，不是用户要看的信息——一个会话级、
 * 一个由曲库派生，重启之后前者会全部变成后者，图标会无缘无故地换一个。
 */
export type DownloadState = "downloading" | "downloaded" | "failed" | "idle";

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

  /**
   * 下载过的歌曲：**文件名 → 来源**。
   *
   * 歌单条目自己也会存一份来源，但那只覆盖「从在线搜索加进歌单」的路径；
   * 从**曲库**把一首歌加进歌单时，那条路径手上只有文件名，造不出来源。而这首歌
   * 当初是本应用下载的——下载那一刻 SongInfo 就在手上，顺手记一份，两条路径
   * 就都能在文件被删之后重新下载了。
   *
   * 覆盖不到的是用户自己导入的文件：它们从来没有过来源。
   */
  const sources = ref<Record<string, SongInfo>>(
    trimRecordToLimit(
      readJsonFromStorage<Record<string, SongInfo>>(STORAGE_KEY_DOWNLOAD_SOURCES, {}),
      MAX_DOWNLOAD_SOURCES
    )
  );

  function rememberSource(fileName: string, song: SongInfo) {
    sources.value = trimRecordToLimit(
      { ...sources.value, [fileName]: song },
      MAX_DOWNLOAD_SOURCES
    );
    writeJsonToStorage(STORAGE_KEY_DOWNLOAD_SOURCES, sources.value);
  }

  /** 这个文件当初是从哪首歌下载来的（没有就返回 null）。 */
  function sourceFor(fileName: string): SongInfo | null {
    return sources.value[fileName] ?? null;
  }

  function isAlreadyExistsError(error: unknown): boolean {
    return String(error ?? "").includes("file already exists");
  }

  function setStatus(key: string, status: DownloadStatus) {
    statuses.value = { ...statuses.value, [key]: status };
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
        album: song.album ?? "",
        defaultDirectory: localStore.defaultDirectory,
      });
      await refreshLibrary();
      setStatus(key, "done");
      const fileName = resolveFileName(song, downloaded);
      // 记下文件名 → 来源：以后这份文件被删了，歌单里那一行才有得救
      rememberSource(fileName, song);
      return fileName;
    } catch (error) {
      // 文件已经在磁盘上，这是幂等的成功而不是失败：原先它会弹一句
      // 「文件已存在，无需重复下载」的错误提示，而用户要的结果已经达成了。
      if (isAlreadyExistsError(error)) {
        await refreshLibrary();
        setStatus(key, "done");
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
   * 行上要展示的状态。优先级：下载中 > 已下载 > 失败 > 空闲。
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
    // 本次会话下过的、或曲库里本来就有——对外都是「已下载」
    if (status === "done") return "downloaded";
    if (localStore.hasMusicFile(getExpectedDownloadFileName(song))) return "downloaded";
    if (status === "failed") return "failed";
    return "idle";
  }

  return {
    download,
    statusFor,
    sourceFor,
  };
});

/**
 * 需要让行的操作簇常驻的状态：除了「未下载」都常驻。
 * 已下载也常驻——不管什么时候下的，同一件事在界面上只有一套规矩。
 *
 * 操作簇默认悬停才显示，而下载进度与结果都不再有 toast 兜底——鼠标一移开就
 * 什么都看不到。「已下载」也同样常驻：不管什么时候下的，同一件事在界面上只
 * 该有一套规矩。
 */
export function pinsRowActions(state: DownloadState): boolean {
  return state !== "idle";
}

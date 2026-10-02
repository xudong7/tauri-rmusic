import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElMessage } from "element-plus";
import { TauriCommandError } from "@/api/client";
import { STORAGE_KEY_DOWNLOAD_SOURCES } from "@/constants";
import { useDownloadStore } from "./downloadStore";
import { useLocalMusicStore } from "./localMusicStore";
import type { SongInfo } from "@/types/model";

const commandMocks = vi.hoisted(() => ({
  downloadMusic: vi.fn(),
  scanFiles: vi.fn(),
}));

vi.mock("@/api/commands/music", () => ({
  downloadMusic: commandMocks.downloadMusic,
}));

vi.mock("@/api/commands/file", () => ({
  scanFiles: commandMocks.scanFiles,
  getDefaultMusicDir: vi.fn(),
}));

const song: SongInfo = {
  id: "1",
  name: "Track",
  artists: ["Artist"],
  album: "Album",
  duration: 1000,
  pic_url: "",
  file_hash: "hash",
};

/** 期望的下载文件名，与后端 file.rs 的命名一致 */
const EXPECTED_NAME = "Artist - Track.mp3";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 一个已经入库的文件，路径故意带子目录，用来验证匹配的是基名而不是整串 */
function libraryFile(fileName: string) {
  return { id: 1, file_name: fileName };
}

describe("downloadStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    commandMocks.downloadMusic.mockReset();
    commandMocks.scanFiles.mockReset();
    commandMocks.scanFiles.mockResolvedValue([]);
  });

  async function setup(currentDirectory = "/music") {
    const localStore = useLocalMusicStore();
    localStore.currentDirectory = currentDirectory;
    return { store: useDownloadStore(), localStore };
  }

  it("下载成功后状态是 downloaded，并刷新当前目录", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    const { store } = await setup();

    const fileName = await store.download(song);

    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();
    expect(commandMocks.scanFiles).toHaveBeenCalledWith({
      path: "/music",
      defaultDirectory: null,
    });
    expect(fileName).toBe(EXPECTED_NAME);
    expect(store.statusFor(song)).toBe("downloaded");
  });

  it("文件已存在视为成功，且不弹错误提示", async () => {
    const errorSpy = vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValue(
      new TauriCommandError(
        "download_music",
        `file already exists: /music/${EXPECTED_NAME}`
      )
    );
    commandMocks.scanFiles.mockResolvedValue([libraryFile(EXPECTED_NAME)]);
    const { store } = await setup();

    const fileName = await store.download(song);

    expect(fileName).toBe(EXPECTED_NAME);
    expect(store.statusFor(song)).toBe("downloaded");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("失败时置为 failed、弹错误提示并返回 null", async () => {
    const errorSpy = vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValue(
      new TauriCommandError("download_music", "network error")
    );
    const { store } = await setup();

    const fileName = await store.download(song);

    expect(fileName).toBeNull();
    expect(store.statusFor(song)).toBe("failed");
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("同一首歌并发调用只发一次请求，且两个调用拿到同一个结果", async () => {
    const deferred = createDeferred<string>();
    commandMocks.downloadMusic.mockReturnValue(deferred.promise);
    const { store } = await setup();

    const first = store.download(song);
    const second = store.download(song);
    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();

    deferred.resolve(EXPECTED_NAME);
    await expect(first).resolves.toBe(EXPECTED_NAME);
    await expect(second).resolves.toBe(EXPECTED_NAME);
  });

  it("失败后重试会真的重发请求", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({}) as never);
    commandMocks.downloadMusic.mockRejectedValueOnce(
      new TauriCommandError("download_music", "network error")
    );
    const { store } = await setup();

    await store.download(song);
    expect(store.statusFor(song)).toBe("failed");

    commandMocks.downloadMusic.mockResolvedValueOnce(EXPECTED_NAME);
    await store.download(song);

    expect(commandMocks.downloadMusic).toHaveBeenCalledTimes(2);
    expect(store.statusFor(song)).toBe("downloaded");
  });

  // 基名匹配：曲库里的 file_name 是 relative_path，可能带子目录且分隔符两种都有，
  // 而判定时手上只有下载产生的纯文件名。
  it.each(["Album/Artist - Track.mp3", "Album\\Artist - Track.mp3"])(
    "曲库里已有同名文件即显示为已下载：%s",
    async (fileName) => {
      const { store, localStore } = await setup();
      localStore.musicFiles = [libraryFile(fileName)];

      expect(store.statusFor(song)).toBe("downloaded");
    }
  );

  // 两种来源（本次会话下过 / 曲库里本来就有）对外是同一个状态，界面因此只有
  // 一个打勾图标——重启之后不再有「怎么换了个图标」。
  it("下载成功后即为已下载，并保持住（不随时间或重扫变化）", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([libraryFile(EXPECTED_NAME)]);
    const { store } = await setup();

    await store.download(song);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(store.statusFor(song)).toBe("downloaded");
  });

  // 重扫有可能被并发的另一次加载顶掉（localMusicStore 的 requestId 守卫会
  // 静默丢弃结果），那时曲库查不到这首，但文件确实在磁盘上——不能退回未下载。
  it("重扫没带回这个文件时，仍显示为已下载而不是退回未下载", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([]);
    const { store } = await setup();

    await store.download(song);

    expect(store.statusFor(song)).toBe("downloaded");
  });

  it("没有下载过也不在曲库时是 idle", async () => {
    const { store } = await setup();

    expect(store.statusFor(song)).toBe("idle");
  });

  // 歌单条目自己会存一份来源，但那只覆盖「从在线搜索加进歌单」的路径。从曲库
  // 把歌加进歌单时手上只有文件名，所以下载那一刻要另记一份「文件名 → 来源」，
  // 两条路径才都能在文件被删之后重新下载。
  describe("下载来源索引", () => {
    it("下载成功后按文件名记下来源", async () => {
      commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
      const { store, localStore } = await setup();
      localStore.musicFiles = [libraryFile(EXPECTED_NAME)];

      await store.download(song);

      expect(store.sourceFor(EXPECTED_NAME)).toEqual(song);
      // 也要落到 localStorage：重启之后还得查得到
      const raw = localStorage.getItem(STORAGE_KEY_DOWNLOAD_SOURCES);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string)[EXPECTED_NAME].id).toBe("1");
    });

    it("没下载过的文件名查不到来源", async () => {
      const { store } = await setup();

      expect(store.sourceFor("nope.mp3")).toBeNull();
    });

    it("重新加载后仍能查到（存储里读回来的）", async () => {
      commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
      const first = await setup();
      first.localStore.musicFiles = [libraryFile(EXPECTED_NAME)];
      await first.store.download(song);

      // 换一个 pinia，模拟重启
      setActivePinia(createPinia());
      const store = useDownloadStore();

      expect(store.sourceFor(EXPECTED_NAME)?.id).toBe("1");
    });
  });
});

describe("下载来源索引上限", () => {
  it("启动时裁剪到上限，保留最近写入的条目", () => {
    const record: Record<string, SongInfo> = {};
    for (let i = 0; i < 600; i++) {
      record[`f${i}.mp3`] = { ...song, file_hash: `hash-${i}` };
    }
    localStorage.setItem(STORAGE_KEY_DOWNLOAD_SOURCES, JSON.stringify(record));
    setActivePinia(createPinia());

    const store = useDownloadStore();
    expect(store.sourceFor("f0.mp3")).toBeNull();
    expect(store.sourceFor("f599.mp3")).not.toBeNull();
  });
});

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElMessage } from "element-plus";
import { TauriCommandError } from "@/api/client";
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

  it("下载成功后置为 done，并刷新当前目录", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    const { store } = await setup();

    const fileName = await store.download(song);

    expect(commandMocks.downloadMusic).toHaveBeenCalledOnce();
    expect(commandMocks.scanFiles).toHaveBeenCalledWith({
      path: "/music",
      defaultDirectory: null,
    });
    expect(fileName).toBe(EXPECTED_NAME);
    expect(store.statusFor(song)).toBe("done");
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
    expect(store.statusFor(song)).toBe("done");
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
    expect(store.statusFor(song)).toBe("done");
  });

  // 基名匹配：曲库里的 file_name 是 relative_path，可能带子目录且分隔符两种都有，
  // 而判定时手上只有下载产生的纯文件名。
  it.each(["Album/Artist - Track.mp3", "Album\\Artist - Track.mp3"])(
    "曲库里已有同名文件即为 inLibrary：%s",
    async (fileName) => {
      const { store, localStore } = await setup();
      localStore.musicFiles = [libraryFile(fileName)];

      expect(store.statusFor(song)).toBe("inLibrary");
    }
  );

  it("刚下完是打勾，不会被立刻降级成「已在曲库」", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([libraryFile(EXPECTED_NAME)]);
    const { store } = await setup();

    await store.download(song);

    expect(store.statusFor(song)).toBe("done");
  });

  // 打勾是会话级的、不过期：用户要求下载成功后图标常驻，不再依赖悬停。
  it("打勾常驻，不会随时间降级成「已在曲库」", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([libraryFile(EXPECTED_NAME)]);
    const { store } = await setup();

    await store.download(song);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(store.statusFor(song)).toBe("done");
  });

  // 重扫有可能被并发的另一次加载顶掉（localMusicStore 的 requestId 守卫会
  // 静默丢弃结果），那时曲库查不到这首，但文件确实在磁盘上——不能退回未下载。
  it("重扫没带回这个文件时，仍显示为已下载而不是退回未下载", async () => {
    commandMocks.downloadMusic.mockResolvedValue(EXPECTED_NAME);
    commandMocks.scanFiles.mockResolvedValue([]);
    const { store } = await setup();

    await store.download(song);

    expect(store.statusFor(song)).toBe("done");
  });

  it("没有下载过也不在曲库时是 idle", async () => {
    const { store } = await setup();

    expect(store.statusFor(song)).toBe("idle");
  });
});

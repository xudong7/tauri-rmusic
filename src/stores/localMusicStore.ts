import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { STORAGE_KEY_DEFAULT_DIRECTORY } from "@/constants";
import type { MusicFile } from "@/types/model";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getDefaultMusicDir, loadCachedMusicFiles, scanFiles } from "@/api/commands/file";
import { joinPathSegment } from "@/utils/pathUtils";
import { getFileName } from "@/utils/songUtils";

export const useLocalMusicStore = defineStore("localMusic", () => {
  const musicFiles = ref<MusicFile[]>([]);
  const searchKeyword = ref("");
  const currentDirectory = ref("");
  const isLoading = ref(false);
  const isRefreshing = ref(false);

  const defaultDirectory = ref<string | null>(null);
  const isInitialized = ref(false);
  let initializePromise: Promise<void> | null = null;
  let latestLoadRequestId = 0;

  function getLibraryRootFromMusicDir(musicDir: string): string {
    return musicDir.replace(/[\/\\]music$/, "");
  }

  function getMusicDirFromLibraryRoot(root: string): string {
    return joinPathSegment(root, "music");
  }

  const filteredMusicFiles = computed(() => {
    if (!searchKeyword.value.trim()) return musicFiles.value;
    const keyword = searchKeyword.value.trim().toLowerCase();
    return musicFiles.value.filter((file) =>
      (file.search_text || file.file_name.toLowerCase()).includes(keyword)
    );
  });

  /**
   * 按文件名索引曲库。
   *
   * 放在 store 而不是各调用点各建一份：playerStore 与 PlaylistView 原先
   * 各写了一遍同样的 Map，而 PlaylistCover 用的是线性 find —— 它在侧边栏
   * 按歌单数循环渲染，于是每次渲染都是「歌单数 × 曲库大小」次比较。
   */
  const musicFilesByName = computed(() => {
    const map = new Map<string, MusicFile>();
    for (const file of musicFiles.value) {
      map.set(file.file_name, file);
    }
    return map;
  });

  /**
   * 曲库文件的「基名」集合，用来回答「这个文件名在不在曲库里」。
   *
   * 不能复用 musicFilesByName：它的键是 file_name，而 file_name 等于
   * relative_path，可能带子目录（扫描子目录时是 `专辑/歌手 - 歌名.mp3`）。
   * 下载写入的是 `<root>/music/<歌手> - <歌名>.mp3`，判定时手上只有纯文件名，
   * 只能拿最后一段去比——这也正是 songUtils 里 getLocalFileNameForSong 那套
   * `=== / endsWith("/"+x) / endsWith("\\"+x)` 的语义，这里是它的 O(1) 版本。
   */
  const musicFileNames = computed(() => {
    const names = new Set<string>();
    for (const file of musicFiles.value) {
      names.add(getFileName(file.file_name));
    }
    return names;
  });

  function hasMusicFile(name: string): boolean {
    return musicFileNames.value.has(name);
  }

  async function loadMusicFiles(path?: string, options?: { restoreCache?: boolean }) {
    const requestId = ++latestLoadRequestId;
    let restoredCachedFiles = false;
    isLoading.value = musicFiles.value.length === 0;
    try {
      if (path) currentDirectory.value = path;
      if (options?.restoreCache) {
        const cachedFiles = await loadCachedMusicFiles({
          path: path || null,
          defaultDirectory: defaultDirectory.value,
        });
        if (requestId !== latestLoadRequestId) return;
        if (cachedFiles.length > 0) {
          musicFiles.value = cachedFiles;
          restoredCachedFiles = true;
          isLoading.value = false;
        }
      }

      const refresh = refreshMusicFilesFromDisk(requestId, path);
      if (restoredCachedFiles) {
        void refresh;
        return;
      }
      await refresh;
    } catch (error) {
      if (requestId !== latestLoadRequestId) return;
      console.error("加载音乐文件失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadMusicFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === latestLoadRequestId && !restoredCachedFiles) {
        isLoading.value = false;
      }
    }
  }

  async function refreshMusicFilesFromDisk(requestId: number, path?: string) {
    isRefreshing.value = true;
    try {
      const files = await scanFiles({
        path: path || null,
        defaultDirectory: defaultDirectory.value,
      });
      if (requestId !== latestLoadRequestId) return;
      musicFiles.value = files;
    } catch (error) {
      if (requestId !== latestLoadRequestId) return;
      console.error("刷新音乐文件失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadMusicFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === latestLoadRequestId) {
        isLoading.value = false;
        isRefreshing.value = false;
      }
    }
  }

  async function refreshCurrentDirectory() {
    if (currentDirectory.value) await loadMusicFiles(currentDirectory.value);
  }

  function searchLocalMusic(keyword: string) {
    searchKeyword.value = keyword;
    if (!keyword.trim()) {
      return;
    }
    const count = filteredMusicFiles.value.length;
    if (count === 0) {
      ElMessage.info(i18n.global.t("messages.noSearchResult"));
    } else {
      ElMessage.success(i18n.global.t("messages.foundSongs", { count }));
    }
  }

  async function setDefaultDirectory(path: string) {
    try {
      defaultDirectory.value = path;
      currentDirectory.value = getMusicDirFromLibraryRoot(path);
      localStorage.setItem(STORAGE_KEY_DEFAULT_DIRECTORY, path);
      await loadMusicFiles(currentDirectory.value, { restoreCache: true });
      ElMessage.success(i18n.global.t("messages.setDirSuccess"));
    } catch (error) {
      console.error("设置默认目录失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.setDirFailed")}: ${parseErrorMessage(error)}`
      );
    }
  }

  function getDefaultDirectory(): string | null {
    return defaultDirectory.value;
  }

  async function resetDefaultDirectory() {
    try {
      const systemDefaultDir = await getDefaultMusicDir();
      if (systemDefaultDir) {
        const parentDir = getLibraryRootFromMusicDir(systemDefaultDir);
        defaultDirectory.value = parentDir;
        currentDirectory.value = systemDefaultDir;
        localStorage.removeItem(STORAGE_KEY_DEFAULT_DIRECTORY);
        await loadMusicFiles(systemDefaultDir, { restoreCache: true });
        ElMessage.success(i18n.global.t("messages.resetDirSuccess"));
      }
    } catch (error) {
      console.error("重置默认目录失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.resetDirFailed")}: ${parseErrorMessage(error)}`
      );
    }
  }

  async function initializeLocalLibrary() {
    if (isInitialized.value) return;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      try {
        const savedDefaultDir = localStorage.getItem(STORAGE_KEY_DEFAULT_DIRECTORY);
        if (savedDefaultDir) {
          defaultDirectory.value = savedDefaultDir;
          currentDirectory.value = getMusicDirFromLibraryRoot(savedDefaultDir);
          await loadMusicFiles(undefined, { restoreCache: true });
        } else {
          const defaultDir = await getDefaultMusicDir();
          if (defaultDir) {
            const parentDir = getLibraryRootFromMusicDir(defaultDir);
            defaultDirectory.value = parentDir;
            currentDirectory.value = defaultDir;
            await loadMusicFiles(undefined, { restoreCache: true });
          }
        }
        isInitialized.value = true;
      } catch (error) {
        console.error("加载默认目录失败:", error);
      } finally {
        initializePromise = null;
      }
    })();

    return initializePromise;
  }

  return {
    musicFiles,
    musicFilesByName,
    hasMusicFile,
    filteredMusicFiles,
    searchKeyword,
    currentDirectory,
    isLoading,
    isRefreshing,
    defaultDirectory,
    isInitialized,
    loadMusicFiles,
    refreshCurrentDirectory,
    searchLocalMusic,
    setDefaultDirectory,
    getDefaultDirectory,
    resetDefaultDirectory,
    initializeLocalLibrary,
  };
});

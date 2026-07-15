import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { STORAGE_KEY_DEFAULT_DIRECTORY } from "@/constants";
import type { MusicFile } from "@/types/model";
import { i18n } from "@/i18n";
import { getDefaultMusicDir, loadCachedMusicFiles, scanFiles } from "@/api/commands/file";
import { joinPathSegment } from "@/utils/pathUtils";

export const useLocalMusicStore = defineStore("localMusic", () => {
  const musicFiles = ref<MusicFile[]>([]);
  const searchKeyword = ref("");
  const currentDirectory = ref("");
  const isLoading = ref(false);

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

  async function loadMusicFiles(path?: string, options?: { restoreCache?: boolean }) {
    const requestId = ++latestLoadRequestId;
    isLoading.value = true;
    try {
      if (path) currentDirectory.value = path;
      if (options?.restoreCache) {
        const cachedFiles = await loadCachedMusicFiles({
          path: path || null,
          defaultDirectory: defaultDirectory.value,
        });
        if (requestId !== latestLoadRequestId) return;
        if (cachedFiles.length > 0) musicFiles.value = cachedFiles;
      }
      const files = await scanFiles({
        path: path || null,
        defaultDirectory: defaultDirectory.value,
      });
      if (requestId !== latestLoadRequestId) return;
      musicFiles.value = files;
    } catch (error) {
      if (requestId !== latestLoadRequestId) return;
      console.error("加载音乐文件失败:", error);
      ElMessage.error(`${i18n.global.t("errors.loadMusicFailed")}: ${error}`);
    } finally {
      if (requestId === latestLoadRequestId) isLoading.value = false;
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
      ElMessage.error(`${i18n.global.t("errors.setDirFailed")}: ${error}`);
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
      ElMessage.error(`${i18n.global.t("errors.resetDirFailed")}: ${error}`);
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
    filteredMusicFiles,
    searchKeyword,
    currentDirectory,
    isLoading,
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

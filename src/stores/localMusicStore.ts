import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { STORAGE_KEY_DEFAULT_DIRECTORY } from "@/constants";
import type { MusicFile } from "@/types/model";
import { i18n } from "@/i18n";
import { getDefaultMusicDir, scanFiles } from "@/api/commands/file";

export const useLocalMusicStore = defineStore("localMusic", () => {
  const musicFiles = ref<MusicFile[]>([]);
  const currentDirectory = ref("");
  const currentMusic = ref<MusicFile | null>(null); // 仅用于兼容旧接口（实际播放状态在 playerStore）

  const defaultDirectory = ref<string | null>(null);

  async function loadMusicFiles(path?: string) {
    try {
      if (path) currentDirectory.value = path;
      musicFiles.value = await scanFiles({
        path: path || null,
        defaultDirectory: defaultDirectory.value,
      });
    } catch (error) {
      console.error("加载音乐文件失败:", error);
      ElMessage.error(`${i18n.global.t("errors.loadMusicFailed")}: ${error}`);
    }
  }

  async function refreshCurrentDirectory() {
    if (currentDirectory.value) await loadMusicFiles(currentDirectory.value);
  }

  function searchLocalMusic(keyword: string) {
    if (!keyword.trim()) {
      void refreshCurrentDirectory();
      return;
    }
    const filteredFiles = musicFiles.value.filter((file) =>
      file.file_name.toLowerCase().includes(keyword.toLowerCase())
    );
    musicFiles.value = filteredFiles;

    if (filteredFiles.length === 0) {
      ElMessage.info(i18n.global.t("messages.noSearchResult"));
    } else {
      ElMessage.success(
        i18n.global.t("messages.foundSongs", { count: filteredFiles.length })
      );
    }
  }

  async function setDefaultDirectory(path: string) {
    try {
      defaultDirectory.value = path;
      localStorage.setItem(STORAGE_KEY_DEFAULT_DIRECTORY, path);
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
        defaultDirectory.value = systemDefaultDir;
        localStorage.removeItem(STORAGE_KEY_DEFAULT_DIRECTORY);
        await loadMusicFiles(systemDefaultDir);
        ElMessage.success(i18n.global.t("messages.resetDirSuccess"));
      }
    } catch (error) {
      console.error("重置默认目录失败:", error);
      ElMessage.error(`${i18n.global.t("errors.resetDirFailed")}: ${error}`);
    }
  }

  async function initializeLocalLibrary() {
    try {
      const savedDefaultDir = localStorage.getItem(STORAGE_KEY_DEFAULT_DIRECTORY);
      if (savedDefaultDir) {
        defaultDirectory.value = savedDefaultDir;
        currentDirectory.value = `${savedDefaultDir}/music`;
        await loadMusicFiles();
      } else {
        const defaultDir = await getDefaultMusicDir();
        if (defaultDir) {
          const parentDir = defaultDir.replace(/[\/\\]music$/, "");
          defaultDirectory.value = parentDir;
          currentDirectory.value = defaultDir;
          await loadMusicFiles();
        }
      }
    } catch (error) {
      console.error("加载默认目录失败:", error);
    }
  }

  return {
    musicFiles,
    currentDirectory,
    currentMusic,
    defaultDirectory,
    loadMusicFiles,
    refreshCurrentDirectory,
    searchLocalMusic,
    setDefaultDirectory,
    getDefaultDirectory,
    resetDefaultDirectory,
    initializeLocalLibrary,
  };
});

<template>
  <div class="local-music-view">
    <MusicList
      :musicFiles="localStore.filteredMusicFiles"
      :currentMusic="playerStore.currentMusic"
      :isPlaying="playerStore.isPlaying"
      :loading="localStore.isLoading"
      :refreshing="localStore.isRefreshing"
      :getDefaultDirectory="localStore.getDefaultDirectory"
      :showImportButton="true"
      @play="playLocalMusic"
      @toggle-current="playerStore.togglePlay"
      @import="importMusic"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import MusicList from "@/components/feature/MusicList/MusicList.vue";
import { ViewMode } from "@/types/model";
import { importMusic as importMusicCommand } from "@/api/commands/file";
import type { MusicFile } from "@/types/model";

const { t } = useI18n();
const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();

onMounted(() => {
  viewStore.setViewMode(ViewMode.LOCAL);
});

function playLocalMusic(music: MusicFile) {
  void playerStore.playMusic(music, { queue: localStore.filteredMusicFiles });
}

async function importMusic() {
  try {
    const selected = await open({
      multiple: true,
      filters: [
        { name: t("import.audioFiles"), extensions: ["mp3", "wav", "ogg", "flac"] },
      ],
    });
    if (!selected || (Array.isArray(selected) && selected.length === 0)) return;

    const files = Array.isArray(selected) ? selected : [selected];
    const loadingMessage = ElMessage({
      message: t("import.importing", { count: files.length }),
      type: "info",
      duration: 0,
      showClose: true,
    });

    try {
      const result = await importMusicCommand({
        files,
        defaultDirectory: localStore.defaultDirectory,
      });
      loadingMessage.close();
      ElMessage({
        message: result as string,
        type: "success",
        duration: 5000,
        showClose: true,
      });
      localStore.refreshCurrentDirectory();
    } catch (error) {
      loadingMessage.close();
      ElMessage({
        message: `${t("import.failed")}: ${error}`,
        type: "error",
        duration: 5000,
        showClose: true,
      });
    }
  } catch (error) {
    console.error("打开文件对话框失败:", error);
    ElMessage({ message: t("import.openDialogFailed"), type: "error", duration: 3000 });
  }
}
</script>

<style scoped>
.local-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

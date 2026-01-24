<template>
  <div class="local-music-view">
    <MusicList
      :musicFiles="musicStore.musicFiles"
      :currentMusic="musicStore.currentMusic"
      :isPlaying="musicStore.isPlaying"
      :showImportButton="true"
      @play="musicStore.playMusic"
      @import="importMusic"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ElMessage } from "element-plus";
import { useMusicStore } from "@/stores/musicStore";
import MusicList from "@/components/MusicList/MusicList.vue";
import { ViewMode } from "@/types/model";

const { t } = useI18n();
const musicStore = useMusicStore();

onMounted(() => {
  musicStore.switchViewMode(ViewMode.LOCAL);
});

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
      const result = await invoke("import_music", {
        files,
        defaultDirectory: musicStore.currentDirectory || null,
      });
      loadingMessage.close();
      ElMessage({
        message: result as string,
        type: "success",
        duration: 5000,
        showClose: true,
      });
      musicStore.refreshCurrentDirectory();
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

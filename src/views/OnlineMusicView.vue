<template>
  <div class="online-music-view">
    <OnlineMusicList
      :onlineSongs="onlineStore.onlineSongs"
      :onlineArtists="onlineStore.onlineArtists"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="onlineStore.isSearchLoading"
      :totalCount="onlineStore.onlineSongsTotal"
      @play="playerStore.playOnlineSong"
      @download="downloadOnlineSong"
      @load-more="onlineStore.loadMoreResults"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import { ViewMode } from "@/types/model";
import { downloadMusic } from "@/api/commands/music";
import { ElMessage } from "element-plus";
import { i18n } from "@/i18n";
import type { SongInfo } from "@/types/model";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { parseErrorMessage } from "@/utils/errorUtils";

const onlineStore = useOnlineMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const localStore = useLocalMusicStore();

async function downloadOnlineSong(song: SongInfo) {
  try {
    ElMessage.info(i18n.global.t("download.starting"));
    const fileName = await downloadMusic({
      songHash: song.file_hash,
      songName: song.name,
      artist: song.artists.join(", "),
      defaultDirectory: localStore.defaultDirectory,
    });
    ElMessage.success(i18n.global.t("download.done", { fileName }));
  } catch (error) {
    console.error("下载歌曲失败:", error);
    const friendlyMessage = parseErrorMessage(error);
    ElMessage.error(friendlyMessage);
  }
}

onMounted(() => {
  // 当进入在线音乐页面时，设置视图模式为在线
  viewStore.setViewMode(ViewMode.ONLINE);
  onlineStore.resetResults();
});
</script>

<style scoped>
.online-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

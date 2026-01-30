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
      @add-to-playlist="handleAddToPlaylist"
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
import { usePlaylistStore } from "@/stores/playlistStore";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getLocalFileNameForSong, getExpectedDownloadFileName } from "@/utils/songUtils";

const onlineStore = useOnlineMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const localStore = useLocalMusicStore();
const playlistStore = usePlaylistStore();

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

/** 加号添加至播放列表：未下载则先下载，再以本地项加入列表 */
async function handleAddToPlaylist(command: string, row: SongInfo) {
  try {
    const playlistId =
      command === "new"
        ? playlistStore.createPlaylist(i18n.global.t("playlist.newPlaylist")).id
        : command;

    let file_name: string | null = getLocalFileNameForSong(row, localStore.musicFiles);

    let didDownload = false;
    if (!file_name) {
      ElMessage.info(i18n.global.t("download.starting"));
      try {
        const fileName = await downloadMusic({
          songHash: row.file_hash,
          songName: row.name,
          artist: row.artists?.join(", ") ?? "",
          defaultDirectory: localStore.defaultDirectory,
        });
        file_name = fileName;
        didDownload = true;
        await localStore.loadMusicFiles();
      } catch (err: unknown) {
        const msg = String(err ?? "");
        if (msg.includes("file already exists")) {
          await localStore.loadMusicFiles();
          file_name =
            getLocalFileNameForSong(row, localStore.musicFiles) ??
            getExpectedDownloadFileName(row);
        } else {
          const friendlyMessage = parseErrorMessage(err);
          ElMessage.error(friendlyMessage);
          return;
        }
      }
    }

    if (file_name) {
      playlistStore.addToPlaylist(playlistId, { type: "local", file_name });
      const pl = playlistStore.getPlaylist(playlistId);
      const name = pl?.name ?? "";
      ElMessage.success(
        didDownload
          ? i18n.global.t("playlist.downloadedAndAdded", { name })
          : i18n.global.t("playlist.added", { name })
      );
    } else {
      ElMessage.error(i18n.global.t("errors.unknownError"));
    }
  } catch (error) {
    console.error("添加到播放列表失败:", error);
    ElMessage.error(parseErrorMessage(error));
  }
}

onMounted(() => {
  // 进入在线音乐页面时设置视图模式；不重置搜索结果，切换本地/设置再回来仍保留上次搜索
  viewStore.setViewMode(ViewMode.ONLINE);
  viewStore.setLastOnlinePath("/online");
});
</script>

<style scoped>
.online-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

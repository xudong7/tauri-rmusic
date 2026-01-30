<template>
  <div class="artist-view">
    <div class="artist-header" v-if="artistStore.currentArtist">
      <img
        v-if="artistStore.currentArtist.pic_url"
        :src="artistStore.currentArtist.pic_url"
        class="artist-avatar"
        alt=""
      />
      <div v-else class="artist-avatar placeholder"></div>
      <div class="artist-name" :title="artistStore.currentArtist.name">
        {{ artistStore.currentArtist.name }}
      </div>
      <el-button class="back-to-search" text :icon="ArrowLeft" @click="goBackToSearch">
        {{ t("artist.backToSearch") }}
      </el-button>
    </div>

    <OnlineMusicList
      :onlineSongs="artistStore.artistSongs"
      :onlineArtists="[]"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="artistStore.isArtistLoading"
      :totalCount="artistStore.artistSongsTotal"
      :showTitle="false"
      @play="playerStore.playOnlineSong"
      @download="downloadOnlineSong"
      @load-more="artistStore.loadMoreArtistSongs"
      @add-to-playlist="handleAddToPlaylist"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft } from "@element-plus/icons-vue";
import { useArtistStore } from "@/stores/artistStore";
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

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const artistStore = useArtistStore();
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
      const added = playlistStore.addToPlaylist(playlistId, { type: "local", file_name });
      const pl = playlistStore.getPlaylist(playlistId);
      const name = pl?.name ?? "";
      if (added) {
        ElMessage.success(
          didDownload
            ? i18n.global.t("playlist.downloadedAndAdded", { name })
            : i18n.global.t("playlist.added", { name })
        );
      } else {
        ElMessage.info(i18n.global.t("playlist.alreadyInPlaylist", { name }));
      }
    } else {
      ElMessage.error(i18n.global.t("errors.unknownError"));
    }
  } catch (error) {
    console.error("添加到播放列表失败:", error);
    ElMessage.error(parseErrorMessage(error));
  }
}

function getQueryString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
}

function goBackToSearch() {
  router.push({ name: "OnlineMusic" });
}

function load() {
  const id = String(route.params.id || "");
  if (!id) return;

  // 优先使用路由携带的歌手信息渲染头部（搜索结果点击进来会带上）
  const name = getQueryString(route.query.name);
  const pic_url = getQueryString(route.query.pic_url);
  if (name || pic_url) {
    artistStore.currentArtist = {
      id,
      name: name || artistStore.currentArtist?.name || "Artist",
      pic_url: pic_url || artistStore.currentArtist?.pic_url || "",
    };
  }

  // 进入歌手页也属于在线模式，记录路径以便从本地/设置返回时恢复歌手页
  viewStore.setViewMode(ViewMode.ONLINE);
  viewStore.setLastOnlinePath(route.fullPath);
  artistStore.loadArtistSongs(id);
}

onMounted(load);
watch(() => route.params.id, load);
watch(() => route.query, load);
</script>

<style scoped>
.artist-view {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.artist-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 8px 14px;
  flex-shrink: 0;
}

.back-to-search {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--el-text-color-secondary);
}
.back-to-search:hover {
  color: var(--el-color-primary);
}

.artist-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--el-fill-color);
}

.artist-avatar.placeholder {
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
}

.artist-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

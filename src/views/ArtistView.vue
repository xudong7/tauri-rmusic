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
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute } from "vue-router";
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
import { parseErrorMessage } from "@/utils/errorUtils";

const route = useRoute();
const artistStore = useArtistStore();
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

function getQueryString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
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

  // 进入歌手页也属于在线模式
  viewStore.setViewMode(ViewMode.ONLINE);
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

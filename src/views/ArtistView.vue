<template>
  <div class="artist-view">
    <PageHeader v-if="artistStore.currentArtist" :title="artistStore.currentArtist.name">
      <template #before-title>
        <CoverImage
          :src="artistStore.currentArtist.pic_url"
          alt=""
          :size="40"
          :radius="999"
          variant="artist"
          class="artist-avatar"
        />
      </template>
      <template #actions>
        <el-button class="back-to-search" text :icon="ArrowLeft" @click="goBackToSearch">
          {{ t("artist.backToSearch") }}
        </el-button>
      </template>
    </PageHeader>

    <OnlineMusicList
      :onlineSongs="artistStore.artistSongs"
      :onlineArtists="[]"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="artistStore.isArtistLoading"
      :totalCount="artistStore.artistSongsTotal"
      :showTitle="false"
      @play="playArtistSong"
      @download="downloadOnlineSong"
      @load-more="artistStore.loadMoreArtistSongs"
      @add-to-playlist="addOnlineSongToPlaylist"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft } from "@element-plus/icons-vue";
import { useArtistStore } from "@/stores/artistStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import { ViewMode } from "@/types/model";
import { useOnlinePlaylistActions } from "@/composables/useOnlinePlaylistActions";
import type { SongInfo } from "@/types/model";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const artistStore = useArtistStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const { downloadOnlineSong, addOnlineSongToPlaylist } = useOnlinePlaylistActions();

function playArtistSong(song: SongInfo) {
  void playerStore.playOnlineSong(song, { queue: artistStore.artistSongs });
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

watch(() => route.fullPath, load, { immediate: true });
</script>

<style scoped>
.artist-view {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.back-to-search {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--el-text-color-secondary);
  transition: color 0.2s ease;
}
.back-to-search:hover {
  color: var(--el-color-primary);
}

.artist-avatar {
  flex-shrink: 0;
  box-shadow: var(--app-button-shadow);
}
</style>

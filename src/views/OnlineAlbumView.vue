<template>
  <PageLayout class="online-album-view" max-width="wide">
    <PageHeader v-if="store.album" :title="store.album.name" :subtitle="subtitle">
      <template #before-title>
        <CoverImage
          :src="store.album.pic_url"
          alt=""
          :size="64"
          :radius="10"
          variant="album"
          class="online-album-view__cover"
        />
      </template>
      <template #actions>
        <el-button text :icon="ArrowLeft" @click="goBack">{{
          t("onlineAlbum.back")
        }}</el-button>
      </template>
    </PageHeader>

    <OnlineMusicList
      :onlineSongs="store.songs"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="store.isLoading"
      :totalCount="store.songs.length"
      :hasMore="false"
      :showTitle="false"
      @play="playSong"
      @toggle-current="playerStore.togglePlay"
      @download="downloadOnlineSong"
      @load-more="() => {}"
      @add-to-playlist="addOnlineSongToPlaylist"
    >
      <template #loading><el-skeleton :rows="6" animated /></template>
      <template #empty>
        <el-empty :description="store.isLoading ? '' : t('onlineAlbum.notFound')" />
      </template>
    </OnlineMusicList>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft } from "@element-plus/icons-vue";
import type { SongInfo } from "@/types/model";
import { ViewMode } from "@/types/model";
import { formatPublishDate } from "@/utils/songUtils";
import { useOnlineAlbumStore } from "@/stores/onlineAlbumStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import { useOnlinePlaylistActions } from "@/composables/useOnlinePlaylistActions";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useOnlineAlbumStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const { downloadOnlineSong, addOnlineSongToPlaylist } = useOnlinePlaylistActions();

const subtitle = computed(() => {
  const album = store.album;
  if (!album) return undefined;
  return [
    album.artist,
    t("onlineAlbum.songCount", { count: album.size }),
    formatPublishDate(album.publish_time, locale.value),
    album.company,
  ]
    .filter(Boolean)
    .join(" · ");
});

function playSong(song: SongInfo) {
  // 专辑曲目一次性取全，队列即整张专辑
  void playerStore.playOnlineSong(song, { queue: store.songs });
}

function goBack() {
  router.push({ name: "OnlineMusic" });
}

function load() {
  const id = String(route.params.id || "");
  if (!id) return;
  viewStore.setViewMode(ViewMode.ONLINE);
  viewStore.setLastOnlinePath(route.fullPath);
  void store.loadAlbum(id);
}

// 同 OnlinePlaylistView：路由参数变化会复用组件实例，必须用 watch 而非 onMounted
watch(() => route.fullPath, load, { immediate: true });
</script>

<style scoped>
.online-album-view {
  overflow: hidden;
}

.online-album-view__cover {
  margin-right: 12px;
}
</style>

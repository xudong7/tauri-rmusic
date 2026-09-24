<template>
  <PageLayout class="online-album-view">
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
    <!-- 加载中先占住标题位，专辑头到位前页面不再整体跳动 -->
    <div v-else-if="store.isLoading" class="detail-header-skeleton" aria-hidden="true">
      <el-skeleton :rows="2" animated />
    </div>

    <OnlineMusicList
      :onlineSongs="store.songs"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="store.isLoading"
      :totalCount="store.songs.length"
      :hasMore="false"
      @play="playSong"
      @toggle-current="playerStore.togglePlay"
      @load-more="() => {}"
    >
      <template #loading><el-skeleton :rows="6" animated /></template>
      <template #empty>
        <el-empty v-if="store.errorMessage" :description="t('errors.loadAlbumFailed')">
          <el-button type="primary" @click="retry">{{ t("common.retry") }}</el-button>
        </el-empty>
        <el-empty v-else :description="t('onlineAlbum.notFound')" />
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
import { formatPublishDate } from "@/utils/songUtils";
import { useOnlineAlbumStore } from "@/stores/onlineAlbumStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useOnlineAlbumStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();

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
  viewStore.setLastOnlinePath(route.fullPath);
  void store.loadAlbum(id);
}

function retry() {
  void store.loadAlbum(String(route.params.id || ""));
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

/* 与 PageHeader 高度一致，加载时占位不跳动 */
.detail-header-skeleton {
  min-height: var(--app-page-header-height);
  margin-bottom: var(--app-page-header-gap);
  flex-shrink: 0;
}
</style>

<template>
  <PageLayout class="online-playlist-view" max-width="wide">
    <template v-if="store.detail">
      <PageHeader :title="store.detail.name" :subtitle="subtitle">
        <template #before-title>
          <CoverImage
            :src="store.detail.cover_url"
            alt=""
            :size="64"
            :radius="10"
            variant="playlist"
            class="online-playlist-view__cover"
          />
        </template>
        <template #actions>
          <el-button text :icon="ArrowLeft" @click="goBack">{{
            t("onlinePlaylist.back")
          }}</el-button>
        </template>
      </PageHeader>
    </template>

    <!-- 放在 header 之外：PageHeader 的 title/after-title 是同一行 flex，
         长简介塞进 after-title 会把标题挤成省略号。 -->
    <p v-if="store.detail?.description" class="online-playlist-view__desc">
      {{ store.detail.description }}
    </p>

    <OnlineMusicList
      :onlineSongs="store.songs"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="store.isDetailLoading || store.isLoadingMoreTracks"
      :totalCount="store.detail?.track_count ?? 0"
      :hasMore="store.hasMoreTracks"
      :showTitle="false"
      @play="playSong"
      @toggle-current="playerStore.togglePlay"
      @download="downloadOnlineSong"
      @load-more="store.loadMoreTracks"
      @add-to-playlist="addOnlineSongToPlaylist"
    >
      <template #loading><el-skeleton :rows="6" animated /></template>
      <template #empty>
        <el-empty
          :description="store.isDetailLoading ? '' : t('onlinePlaylist.notFound')"
        />
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
import { formatCompactNumber } from "@/utils/songUtils";
import { useOnlinePlaylistStore } from "@/stores/onlinePlaylistStore";
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
const store = useOnlinePlaylistStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const { downloadOnlineSong, addOnlineSongToPlaylist } = useOnlinePlaylistActions();

const subtitle = computed(() => {
  const detail = store.detail;
  if (!detail) return undefined;
  const parts = [
    t("onlinePlaylist.trackCount", { count: detail.track_count }),
    detail.creator,
    formatCompactNumber(detail.play_count, locale.value),
  ].filter(Boolean);
  return parts.join(" · ");
});

function playSong(song: SongInfo) {
  // 队列用当前已加载的曲目。首屏按 PLAYLIST_TRACKS_PAGE_SIZE 一次取满，
  // 因此绝大多数歌单的队列是完整的。
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
  void store.loadDetail(id);
}

// 用 route.fullPath 而非 onMounted：/online/playlist/1 -> /2 会复用同一组件实例，
// onMounted 不会再次触发。
watch(() => route.fullPath, load, { immediate: true });
</script>

<style scoped>
.online-playlist-view {
  overflow: hidden;
}

.online-playlist-view__cover {
  margin-right: 12px;
}

.online-playlist-view__desc {
  flex-shrink: 0;
  margin: 0 4px 12px;
  max-width: 720px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  /* 简介可能很长，两行截断，避免把列表挤下去 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

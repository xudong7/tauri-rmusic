<template>
  <PageLayout class="online-music-view" max-width="wide">
    <div class="online-music-view__tabs">
      <el-segmented v-model="activeTabModel" :options="tabOptions" />
    </div>

    <OnlineMusicList
      v-if="onlineStore.activeTab === 'song'"
      :onlineSongs="onlineStore.onlineSongs"
      :onlineArtists="onlineStore.onlineArtists"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="onlineStore.tabMeta.song.loading"
      :totalCount="onlineStore.onlineSongsTotal"
      @play="playOnlineSongFromSearch"
      @toggle-current="playerStore.togglePlay"
      @download="downloadOnlineSong"
      @load-more="onlineStore.loadMoreActiveTab"
      @add-to-playlist="addOnlineSongToPlaylist"
    />

    <EntityGrid
      v-else
      :items="gridItems"
      :loading="onlineStore.tabMeta[onlineStore.activeTab].loading"
      @activate="handleCardActivate"
      @nearEnd="onlineStore.loadMoreActiveTab"
    >
      <template #loading><el-skeleton :rows="5" animated /></template>
      <template #empty>
        <el-empty :description="t('onlineMusic.empty')" />
      </template>
      <template #footer>
        <p v-if="showRefineHint" class="online-music-view__refine">
          {{ t("onlineMusic.refineHint") }}
        </p>
      </template>
    </EntityGrid>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type {
  AlbumInfo,
  ArtistInfo,
  OnlineSearchTab,
  PlaylistInfo,
  SongInfo,
} from "@/types/model";
import { ViewMode } from "@/types/model";
import { MAX_GRID_ITEMS } from "@/constants";
import { formatCompactNumber } from "@/utils/songUtils";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import EntityGrid from "@/components/feature/EntityGrid/EntityGrid.vue";
import type { EntityCardModel } from "@/components/feature/EntityGrid/types";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import { useOnlinePlaylistActions } from "@/composables/useOnlinePlaylistActions";

const { t, locale } = useI18n();
const router = useRouter();
const onlineStore = useOnlineMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const { downloadOnlineSong, addOnlineSongToPlaylist } = useOnlinePlaylistActions();

const tabOptions = computed(() => [
  { label: t("onlineMusic.tabSong"), value: "song" },
  { label: t("onlineMusic.tabArtist"), value: "artist" },
  { label: t("onlineMusic.tabAlbum"), value: "album" },
  { label: t("onlineMusic.tabPlaylist"), value: "playlist" },
]);

// 可写 computed：切换 tab 交给 store（由此决定是否需要补发请求）。
const activeTabModel = computed({
  get: () => onlineStore.activeTab,
  set: (tab: string) => onlineStore.setTab(tab as OnlineSearchTab),
});

function playlistCard(item: PlaylistInfo): EntityCardModel {
  return {
    key: item.id,
    kind: "playlist",
    title: item.name,
    subtitle: item.creator || undefined,
    metaLabel: formatCompactNumber(item.play_count, locale.value),
    coverUrl: item.cover_url,
  };
}

function albumCard(item: AlbumInfo): EntityCardModel {
  return {
    key: item.id,
    kind: "album",
    title: item.name,
    subtitle: item.artist || undefined,
    metaLabel: t("onlineAlbum.songCount", { count: item.size }),
    coverUrl: item.pic_url,
  };
}

function artistCard(item: ArtistInfo): EntityCardModel {
  return {
    key: item.id,
    kind: "artist",
    title: item.name,
    coverUrl: item.pic_url,
  };
}

const gridItems = computed<EntityCardModel[]>(() => {
  const tab = onlineStore.activeTab;
  if (tab === "artist") return onlineStore.artistResults.map(artistCard);
  if (tab === "album") return onlineStore.albumResults.map(albumCard);
  if (tab === "playlist") return onlineStore.playlistResults.map(playlistCard);
  return [];
});

/** 触顶后不再翻页，提示用户细化关键词，而不是静默停止加载。 */
const showRefineHint = computed(() => {
  const tab = onlineStore.activeTab;
  const meta = onlineStore.tabMeta[tab];
  if (meta.hasMore) return false;
  const loaded = gridItems.value.length;
  return loaded >= MAX_GRID_ITEMS && loaded < meta.total;
});

function handleCardActivate(card: EntityCardModel) {
  if (card.kind === "artist") {
    router.push({ name: "Artist", params: { id: card.key } });
  } else if (card.kind === "album") {
    router.push({ name: "OnlineAlbum", params: { id: card.key } });
  } else {
    router.push({ name: "OnlinePlaylist", params: { id: card.key } });
  }
}

function playOnlineSongFromSearch(song: SongInfo) {
  void playerStore.playOnlineSong(song, { queue: onlineStore.onlineSongs });
}

onMounted(() => {
  // 进入在线音乐页面时设置视图模式；不重置搜索结果，切换本地/设置再回来仍保留上次搜索
  viewStore.setViewMode(ViewMode.ONLINE);
  viewStore.setLastOnlinePath("/online");
});
</script>

<style scoped>
.online-music-view {
  overflow: hidden;
}

.online-music-view__tabs {
  padding: 0 4px 12px;
  flex-shrink: 0;
}

.online-music-view__refine {
  margin: 4px 0 16px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<template>
  <PageLayout class="artist-view">
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

    <!-- 计数放在 header 之外：PageHeader 的 title/after-title 是同一行 flex，
         把额外内容塞进 after-title 会挤占标题空间。 -->
    <p v-if="countsLabel" class="artist-view__counts">{{ countsLabel }}</p>

    <div class="artist-view__tabs">
      <el-segmented v-model="activeTab" :options="tabOptions" />
    </div>

    <OnlineMusicList
      v-if="activeTab === 'songs'"
      :onlineSongs="artistStore.artistSongs"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="artistStore.isArtistLoading"
      :totalCount="artistStore.artistSongsTotal"
      :hasMore="artistStore.artistSongsHasMore"
      @play="playArtistSong"
      @toggle-current="playerStore.togglePlay"
      @load-more="artistStore.loadMoreArtistSongs"
    >
      <template #loading><el-skeleton :rows="6" animated /></template>
      <template #empty>
        <el-empty v-if="artistStore.songsError" :description="t('errors.searchFailed')">
          <el-button type="primary" @click="reloadTab">{{ t("common.retry") }}</el-button>
        </el-empty>
        <el-empty v-else :description="t('musicList.empty')" />
      </template>
    </OnlineMusicList>

    <EntityGrid
      v-else
      :items="albumCards"
      :loading="artistStore.isAlbumsLoading"
      @activate="openAlbum"
      @nearEnd="artistStore.loadMoreArtistAlbums"
    >
      <template #loading><el-skeleton :rows="5" animated /></template>
      <template #empty>
        <el-empty
          v-if="artistStore.albumsError"
          :description="t('errors.loadArtistAlbumsFailed')"
        >
          <el-button type="primary" @click="reloadTab">{{ t("common.retry") }}</el-button>
        </el-empty>
        <el-empty v-else :description="t('onlineAlbum.empty')" />
      </template>
    </EntityGrid>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft } from "@element-plus/icons-vue";
import { useArtistStore } from "@/stores/artistStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import EntityGrid from "@/components/feature/EntityGrid/EntityGrid.vue";
import type { EntityCardModel } from "@/components/feature/EntityGrid/types";
import type { AlbumInfo, SongInfo } from "@/types/model";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { formatPublishDate } from "@/utils/songUtils";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const artistStore = useArtistStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();

const activeTab = ref<"songs" | "albums">("songs");

const tabOptions = computed(() => [
  { label: t("artist.hotSongs"), value: "songs" },
  { label: t("artist.albums"), value: "albums" },
]);

const countsLabel = computed(() => {
  const parts: string[] = [];
  if (artistStore.artistMusicCount > 0) {
    parts.push(t("artist.songCount", { count: artistStore.artistMusicCount }));
  }
  if (artistStore.artistAlbumCount > 0) {
    parts.push(t("artist.albumCount", { count: artistStore.artistAlbumCount }));
  }
  return parts.join(" · ");
});

const albumCards = computed<EntityCardModel[]>(() =>
  artistStore.artistAlbums.map((album: AlbumInfo) => ({
    key: album.id,
    kind: "album",
    title: album.name,
    subtitle: formatPublishDate(album.publish_time, locale.value) || undefined,
    metaLabel: t("onlineAlbum.songCount", { count: album.size }),
    coverUrl: album.pic_url,
  }))
);

function playArtistSong(song: SongInfo) {
  void playerStore.playOnlineSong(song, { queue: artistStore.artistSongs });
}

function openAlbum(card: EntityCardModel) {
  router.push({ name: "OnlineAlbum", params: { id: card.key } });
}

function getQueryString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
}

function goBackToSearch() {
  router.push({ name: "OnlineMusic" });
}

function reloadTab() {
  const id = String(route.params.id || "");
  if (!id) return;
  if (activeTab.value === "songs") void artistStore.loadArtistSongs(id, 1);
  else void artistStore.loadArtistAlbums(id, 1);
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
  viewStore.setLastOnlinePath(route.fullPath);
  artistStore.loadArtist(id);
}

watch(() => route.fullPath, load, { immediate: true });
</script>

<style scoped>
.artist-view {
  overflow: hidden;
}

.artist-view__tabs {
  padding: 0 4px 12px;
  flex-shrink: 0;
}

.artist-view__counts {
  flex-shrink: 0;
  margin: 0 4px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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

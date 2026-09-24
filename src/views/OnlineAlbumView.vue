<template>
  <PageLayout class="online-album-view">
    <DetailHero
      v-if="store.album"
      :cover-url="store.album.pic_url"
      variant="album"
      :eyebrow="t('onlineAlbum.kind')"
      :title="store.album.name"
      :meta="subtitle"
      :play-label="t('common.playAll')"
      :shuffle-label="t('common.shufflePlay')"
      :back-label="t('onlineAlbum.back')"
      @play="playAll"
      @shuffle="shuffleAll"
      @back="goBack"
    />
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
import type { SongInfo } from "@/types/model";
import { formatPublishDate } from "@/utils/songUtils";
import { useOnlineAlbumStore } from "@/stores/onlineAlbumStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import { useDetailPlayback } from "@/composables/useDetailPlayback";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import DetailHero from "@/components/layout/DetailHero/DetailHero.vue";
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

const { playAll, shuffleAll } = useDetailPlayback(() => store.songs);

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

/* 骨架屏要与 DetailHero 占同样的高度，否则详情到位时整页会跳一下。
   高度 = 封面 168 + 返回行（约 28 + 14 外边距）+ 头部下外边距 20。
   改动 DetailHero 的封面尺寸或行高时，这里要跟着改。 */
.detail-header-skeleton {
  min-height: 230px;
  flex-shrink: 0;
}
</style>

<template>
  <PageLayout class="online-album-view">
    <DetailHero
      v-if="store.album"
      :cover-url="store.album.pic_url"
      variant="album"
      :eyebrow="t('onlineAlbum.kind')"
      :title="store.album.name"
      :meta="subtitle"
      :back-label="t('onlineAlbum.back')"
      @back="goBack"
    >
      <template #actions>
        <el-tooltip :content="collectLabel" placement="bottom">
          <!-- 与歌单页那颗星同一处、同一形。收藏的只是专辑引用，
               不会下载里面的任何歌曲——要离线听哪几首再单独下。 -->
          <el-button
            circle
            class="online-album-view__collect"
            :class="{ 'is-collected': isCollected }"
            :icon="collectIcon"
            :aria-label="collectLabel"
            @click="toggleCollect"
          />
        </el-tooltip>
      </template>
    </DetailHero>
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
      hide-album
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
import { Star, StarFilled } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { SongInfo } from "@/types/model";
import { formatPublishDate } from "@/utils/songUtils";
import { useOnlineAlbumStore } from "@/stores/onlineAlbumStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import { useCollectedAlbumStore } from "@/stores/collectedAlbumStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import DetailHero from "@/components/layout/DetailHero/DetailHero.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useOnlineAlbumStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const collectedStore = useCollectedAlbumStore();

const subtitle = computed(() => {
  const album = store.album;
  if (!album) return undefined;
  return [
    album.artist,
    t("common.songCount", { count: album.size }),
    formatPublishDate(album.publish_time, locale.value),
    album.company,
  ]
    .filter(Boolean)
    .join(" · ");
});

const albumId = computed(() => String(route.params.id || ""));
const isCollected = computed(() => collectedStore.isCollected(albumId.value));
const collectIcon = computed(() => (isCollected.value ? StarFilled : Star));
const collectLabel = computed(() =>
  isCollected.value ? t("common.uncollect") : t("common.collect")
);

function toggleCollect() {
  const album = store.album;
  if (!album) return;
  const collected = collectedStore.toggleCollected({
    id: album.id,
    name: album.name,
    pic_url: album.pic_url,
    size: album.size,
    artist: album.artist,
    publish_time: album.publish_time,
    company: album.company,
  });
  ElMessage.success(
    collected ? t("common.collectSuccess") : t("common.uncollectSuccess")
  );
}

// 详情到位后刷新已收藏条目的元数据（名称/封面等可能已在服务端变化）
watch(
  () => store.album,
  (album) => {
    if (!album || !collectedStore.isCollected(album.id)) return;
    collectedStore.updateCollected({
      id: album.id,
      name: album.name,
      pic_url: album.pic_url,
      size: album.size,
      artist: album.artist,
      publish_time: album.publish_time,
      company: album.company,
    });
  }
);

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

/* 与两枚胶囊同高，圆角也跟齐 */
.online-album-view__collect {
  width: var(--app-button-height);
  height: var(--app-button-height);
  padding: 0;
}

/* 已收藏：图标常驻主色。悬停也保持，压过 EP 默认的悬停色。 */
.online-album-view__collect.is-collected,
.online-album-view__collect.is-collected:hover {
  color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

/* 骨架屏要与 DetailHero 占同样的高度，否则详情到位时整页会跳一下。
   高度 = 封面 124 + 头部下外边距 16 = 140。改动 DetailHero 的封面尺寸
   或行高时，这里要跟着改。 */
.detail-header-skeleton {
  min-height: 140px;
  flex-shrink: 0;
}
</style>

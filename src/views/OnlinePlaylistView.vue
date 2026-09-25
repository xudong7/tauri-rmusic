<template>
  <PageLayout class="online-playlist-view">
    <template v-if="store.detail">
      <DetailHero
        :cover-url="store.detail.cover_url"
        variant="playlist"
        :eyebrow="t('onlinePlaylist.kind')"
        :title="store.detail.name"
        :meta="subtitle"
        :back-label="t('onlinePlaylist.back')"
        @back="goBack"
      >
        <template #actions>
          <el-tooltip :content="collectLabel" placement="bottom">
            <!-- circle 而非 link + app-icon-button：这一排是两枚 32px 胶囊，
                 裸图标按钮夹在中间尺寸和形状都对不上，看着像走失的图标。 -->
            <el-button
              circle
              class="online-playlist-view__collect"
              :class="{ 'is-collected': isCollected }"
              :icon="collectIcon"
              :aria-label="collectLabel"
              @click="toggleCollect"
            />
          </el-tooltip>
        </template>
      </DetailHero>
    </template>
    <!-- 加载中先占住标题位，歌单头到位前页面不再整体跳动 -->
    <div
      v-else-if="store.isDetailLoading"
      class="detail-header-skeleton"
      aria-hidden="true"
    >
      <el-skeleton :rows="2" animated />
    </div>

    <!-- 放在 hero 之外：hero 的元信息行是单行截断，长简介塞进去会被吃掉 -->
    <!-- 简介独立成行，最多两行截断，避免把列表挤下去 -->
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
      @play="playSong"
      @toggle-current="playerStore.togglePlay"
      @load-more="store.loadMoreTracks"
    >
      <template #loading><el-skeleton :rows="6" animated /></template>
      <template #empty>
        <el-empty v-if="store.detailError" :description="t('errors.loadPlaylistFailed')">
          <el-button type="primary" @click="retry">{{ t("common.retry") }}</el-button>
        </el-empty>
        <el-empty v-else :description="t('onlinePlaylist.notFound')" />
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
import { formatCompactNumber } from "@/utils/songUtils";
import { useOnlinePlaylistStore } from "@/stores/onlinePlaylistStore";
import { useCollectedPlaylistStore } from "@/stores/collectedPlaylistStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import DetailHero from "@/components/layout/DetailHero/DetailHero.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useOnlinePlaylistStore();
const collectedStore = useCollectedPlaylistStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();

const playlistId = computed(() => String(route.params.id || ""));
const isCollected = computed(() => collectedStore.isCollected(playlistId.value));
const collectIcon = computed(() => (isCollected.value ? StarFilled : Star));
const collectLabel = computed(() =>
  isCollected.value ? t("playlist.uncollect") : t("playlist.collect")
);

function toggleCollect() {
  const detail = store.detail;
  if (!detail) return;
  const collected = collectedStore.toggleCollected({
    id: detail.id,
    name: detail.name,
    cover_url: detail.cover_url,
    track_count: detail.track_count,
    creator: detail.creator,
    play_count: detail.play_count,
  });
  ElMessage.success(
    collected ? t("playlist.collectSuccess") : t("playlist.uncollectSuccess")
  );
}

// 详情到位后刷新收藏条目的元数据（名称/封面等可能已在服务端变化）
watch(
  () => store.detail,
  (detail) => {
    if (!detail || !collectedStore.isCollected(detail.id)) return;
    collectedStore.updateCollected({
      id: detail.id,
      name: detail.name,
      cover_url: detail.cover_url,
      track_count: detail.track_count,
      creator: detail.creator,
      play_count: detail.play_count,
    });
  }
);

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
  viewStore.setLastOnlinePath(route.fullPath);
  void store.loadDetail(id);
}

function retry() {
  void store.loadDetail(String(route.params.id || ""));
}

// 用 route.fullPath 而非 onMounted：/online/playlist/1 -> /2 会复用同一组件实例，
// onMounted 不会再次触发。
watch(() => route.fullPath, load, { immediate: true });
</script>

<style scoped>
.online-playlist-view {
  overflow: hidden;
}

/* 与两枚胶囊同高，圆角也跟齐 */
.online-playlist-view__collect {
  width: var(--app-button-height);
  height: var(--app-button-height);
  padding: 0;
}

/* 已收藏：图标常驻主色。悬停也保持，压过 EP 默认的悬停色。 */
.online-playlist-view__collect.is-collected,
.online-playlist-view__collect.is-collected:hover {
  color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

/* 骨架屏要与 DetailHero 占同样的高度，否则详情到位时整页会跳一下。
   高度 = 封面 168 + 返回行（约 28 + 14 外边距）+ 头部下外边距 20。
   改动 DetailHero 的封面尺寸或行高时，这里要跟着改。 */
.detail-header-skeleton {
  min-height: 230px;
  flex-shrink: 0;
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

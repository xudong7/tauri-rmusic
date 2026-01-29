<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { CaretRight, VideoPause, Download, Headset } from "@element-plus/icons-vue";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { formatDuration, formatArtists } from "@/utils/songUtils";

const { t } = useI18n();
const router = useRouter();

const props = withDefaults(
  defineProps<{
    onlineSongs: SongInfo[];
    onlineArtists: ArtistInfo[];
    currentSong: SongInfo | null;
    isPlaying: boolean;
    loading: boolean;
    totalCount: number;
    showTitle?: boolean;
  }>(),
  {
    showTitle: true,
  }
);

const emit = defineEmits(["play", "download", "load-more"]);

const scrollbarRef = ref<{ $el?: HTMLElement } | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const hasMore = ref(false);
const isLoading = ref(false);
let observer: IntersectionObserver | null = null;

watch(
  [() => props.totalCount, () => props.onlineSongs.length],
  () => {
    hasMore.value = props.totalCount > props.onlineSongs.length;
  },
  { immediate: true }
);
watch(
  () => props.loading,
  (v) => {
    isLoading.value = v;
  },
  { immediate: true }
);

function setupScrollObserver() {
  if (observer) return;
  const scrollbarEl = scrollbarRef.value?.$el;
  if (!scrollbarEl) return;
  const wrap = scrollbarEl.querySelector(".el-scrollbar__wrap") as HTMLElement | null;
  if (!wrap || !sentinelRef.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      if (!hasMore.value || isLoading.value) return;
      emit("load-more");
    },
    { root: wrap, rootMargin: "100px 0px", threshold: 0 }
  );
  observer.observe(sentinelRef.value);
}

watch(
  [() => props.loading, () => props.onlineSongs.length],
  () => {
    if (props.loading || props.onlineSongs.length === 0) return;
    nextTick(setupScrollObserver);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (observer && sentinelRef.value) {
    observer.unobserve(sentinelRef.value);
    observer.disconnect();
  }
  observer = null;
});

const isCurrentSong = (s: SongInfo) => props.currentSong?.id === s.id;

function goArtist(a: ArtistInfo) {
  // 将歌手基础信息一并带过去，歌手页可先渲染头部（接口返回缺字段时也能兜底）
  router.push({
    name: "Artist",
    params: { id: a.id },
    query: { name: a.name, pic_url: a.pic_url },
  });
}
</script>

<template>
  <div class="online-music-list-container">
    <div v-if="showTitle" class="list-header">
      <h2 class="list-title">{{ t("onlineMusic.title") }}</h2>
    </div>

    <!-- 仅初次加载时显示骨架屏，加载更多时保持列表不切换，避免滚动回顶 -->
    <div v-if="loading && onlineSongs.length === 0" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="onlineSongs.length === 0" class="empty-list">
      <el-empty :description="t('onlineMusic.empty')" />
    </div>

    <el-scrollbar ref="scrollbarRef" v-else class="list-scroll">
      <div class="list-rows">
        <div v-if="onlineArtists?.length" class="artist-strip">
          <div class="artist-strip-scroll">
            <div
              v-for="a in onlineArtists"
              :key="a.id"
              class="artist-card"
              @click="goArtist(a)"
            >
              <img v-if="a.pic_url" :src="a.pic_url" class="artist-avatar" alt="" />
              <div v-else class="artist-avatar placeholder">
                <el-icon><Headset /></el-icon>
              </div>
              <div class="artist-name" :title="a.name">{{ a.name }}</div>
            </div>
          </div>
        </div>

        <div
          v-for="row in onlineSongs"
          :key="row.id"
          class="list-row"
          :class="{ 'is-current': isCurrentSong(row) }"
          @dblclick="emit('play', row)"
        >
          <div class="col-play">
            <el-button
              circle
              size="small"
              :type="isCurrentSong(row) ? 'primary' : 'default'"
              :icon="isCurrentSong(row) && isPlaying ? VideoPause : CaretRight"
              @click="emit('play', row)"
            />
          </div>
          <div class="col-cover">
            <img v-if="row.pic_url" :src="row.pic_url" class="cover-img" alt="" />
            <div v-else class="cover-placeholder">
              <el-icon><Headset /></el-icon>
            </div>
          </div>
          <div class="col-main">
            <div class="song-title" :class="{ 'is-playing': isCurrentSong(row) }">
              {{ row.name }}
            </div>
            <div class="song-meta">
              {{ formatArtists(row.artists) }}
              <template v-if="row.album"> · {{ row.album }}</template>
            </div>
          </div>
          <div class="col-duration">{{ formatDuration(row.duration) }}</div>
          <div class="col-download">
            <el-button
              circle
              size="small"
              :icon="Download"
              @click="emit('download', row)"
            />
          </div>
        </div>
      </div>
      <!-- 懒加载哨兵：滚动到此区域可见时自动加载更多 -->
      <div
        v-if="totalCount > onlineSongs.length"
        ref="sentinelRef"
        class="load-more-sentinel"
        aria-hidden="true"
      />
    </el-scrollbar>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

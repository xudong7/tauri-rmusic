<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Download, Plus } from "@element-plus/icons-vue";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { formatDuration, formatArtists } from "@/utils/songUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import TrackRow from "@/components/feature/TrackList/TrackRow.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";

const { t } = useI18n();
const router = useRouter();
const playlistStore = usePlaylistStore();

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

const emit = defineEmits(["play", "download", "load-more", "add-to-playlist"]);

const scrollbarRef = ref<{ $el?: HTMLElement } | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const hasMore = ref(false);
const isLoading = ref(false);
let observer: IntersectionObserver | null = null;
let observedSentinel: HTMLElement | null = null;

const onlineSongsRef = computed(() => props.onlineSongs);
const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight } =
  useVirtualListWhenLong<SongInfo>({ source: onlineSongsRef });

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

function teardownScrollObserver() {
  if (observer) {
    if (observedSentinel) observer.unobserve(observedSentinel);
    observer.disconnect();
  }
  observer = null;
  observedSentinel = null;
}

function setupScrollObserver() {
  if (useVirtual.value) {
    teardownScrollObserver();
    return;
  }
  const scrollbarEl = scrollbarRef.value?.$el;
  if (!scrollbarEl) {
    teardownScrollObserver();
    return;
  }
  const wrap = scrollbarEl.querySelector(".el-scrollbar__wrap") as HTMLElement | null;
  const sentinel = sentinelRef.value;
  if (!wrap || !sentinel) {
    teardownScrollObserver();
    return;
  }
  if (observer && observedSentinel === sentinel) return;

  teardownScrollObserver();

  observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      if (!hasMore.value || isLoading.value) return;
      emit("load-more");
    },
    { root: wrap, rootMargin: "100px 0px", threshold: 0 }
  );
  observer.observe(sentinel);
  observedSentinel = sentinel;
}

function requestLoadMore() {
  if (!hasMore.value || isLoading.value) return;
  emit("load-more");
}

function handleVirtualScroll(event: Event) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (distanceToBottom < 220) requestLoadMore();
}

watch(
  [
    () => props.loading,
    () => props.onlineSongs.length,
    () => props.totalCount,
    useVirtual,
  ],
  () => {
    if (useVirtual.value || props.loading || props.onlineSongs.length === 0) {
      teardownScrollObserver();
      return;
    }
    nextTick(setupScrollObserver);
  },
  { immediate: true }
);

onUnmounted(() => {
  teardownScrollObserver();
});

const isCurrentSong = (s: SongInfo) => props.currentSong?.id === s.id;

function toTrackRow(song: SongInfo, sourceIndex: number): TrackRowModel {
  return {
    key: song.id,
    title: song.name,
    artist: formatArtists(song.artists),
    album: song.album || undefined,
    durationLabel: formatDuration(song.duration),
    coverUrl: song.pic_url,
    source: "online",
    sourceIndex,
    isCurrent: isCurrentSong(song),
    isPlaying: props.isPlaying,
  };
}

function goArtist(a: ArtistInfo) {
  router.push({
    name: "Artist",
    params: { id: a.id },
    query: { name: a.name, pic_url: a.pic_url },
  });
}

function handleAddToPlaylist(command: string, row: SongInfo) {
  emit("add-to-playlist", command, row);
}
</script>

<template>
  <div class="online-music-list-container">
    <PageHeader v-if="showTitle" :title="t('onlineMusic.title')" />

    <!-- 仅初次加载时显示骨架屏，加载更多时保持列表不切换，避免滚动回顶 -->
    <div v-if="loading && onlineSongs.length === 0" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="onlineSongs.length === 0" class="empty-list">
      <el-empty :description="t('onlineMusic.empty')" />
    </div>

    <div
      v-else-if="useVirtual"
      v-bind="containerProps"
      class="list-scroll list-scroll-virtual"
      @scroll.passive="handleVirtualScroll"
    >
      <div class="list-rows">
        <div v-if="onlineArtists?.length" class="artist-strip">
          <div class="artist-strip-scroll">
            <div
              v-for="a in onlineArtists"
              :key="a.id"
              class="artist-card"
              @click="goArtist(a)"
            >
              <CoverImage
                :src="a.pic_url"
                alt=""
                :size="54"
                :radius="999"
                variant="artist"
                class="artist-avatar-cover"
              />
              <div class="artist-name" :title="a.name">{{ a.name }}</div>
            </div>
          </div>
        </div>

        <div v-bind="wrapperProps">
          <TrackRow
            v-for="{ data: row, index } in virtualList"
            :key="row.id"
            :item="toTrackRow(row, index)"
            :row-height="rowHeight"
            @activate="emit('play', row)"
          >
            <template #actions>
              <el-button
                circle
                size="small"
                :icon="Download"
                link
                @click="emit('download', row)"
              />
              <el-dropdown
                trigger="click"
                @command="(cmd: string) => handleAddToPlaylist(cmd, row)"
              >
                <el-button circle size="small" :icon="Plus" link />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="new">{{
                      t("playlist.newPlaylist")
                    }}</el-dropdown-item>
                    <el-dropdown-item
                      v-for="pl in playlistStore.playlists"
                      :key="pl.id"
                      :command="pl.id"
                    >
                      {{ pl.name || t("playlist.unnamed") }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </TrackRow>
        </div>
      </div>
      <div
        v-if="totalCount > onlineSongs.length"
        class="load-more-sentinel"
        aria-hidden="true"
      />
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
              <CoverImage
                :src="a.pic_url"
                alt=""
                :size="54"
                :radius="999"
                variant="artist"
                class="artist-avatar-cover"
              />
              <div class="artist-name" :title="a.name">{{ a.name }}</div>
            </div>
          </div>
        </div>

        <TrackRow
          v-for="(row, index) in onlineSongs"
          :key="row.id"
          :item="toTrackRow(row, index)"
          @activate="emit('play', row)"
        >
          <template #actions>
            <el-button
              circle
              size="small"
              :icon="Download"
              link
              @click="emit('download', row)"
            />
            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleAddToPlaylist(cmd, row)"
            >
              <el-button circle size="small" :icon="Plus" link />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="new">{{
                    t("playlist.newPlaylist")
                  }}</el-dropdown-item>
                  <el-dropdown-item
                    v-for="pl in playlistStore.playlists"
                    :key="pl.id"
                    :command="pl.id"
                  >
                    {{ pl.name || t("playlist.unnamed") }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </TrackRow>
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

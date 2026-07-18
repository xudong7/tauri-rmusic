<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Download, Plus } from "@element-plus/icons-vue";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { formatDuration, formatArtists } from "@/utils/songUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
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

const emit = defineEmits([
  "play",
  "toggle-current",
  "download",
  "load-more",
  "add-to-playlist",
]);

function requestLoadMore() {
  if (props.loading || props.onlineSongs.length >= props.totalCount) return;
  emit("load-more");
}

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

const trackRows = computed(() => props.onlineSongs.map(toTrackRow));
const resultSummary = computed(() =>
  props.totalCount > 0
    ? t("onlineMusic.resultSummary", { count: props.totalCount })
    : undefined
);

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
    <PageHeader
      v-if="showTitle"
      :title="t('onlineMusic.title')"
      :subtitle="resultSummary"
    />

    <TrackList
      :items="trackRows"
      :loading="loading"
      width="online"
      @activate="emit('play', onlineSongs[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @near-end="requestLoadMore"
    >
      <template #before>
        <div v-if="onlineArtists?.length" class="artist-strip">
          <div class="artist-strip-heading">{{ t("onlineMusic.artists") }}</div>
          <div class="artist-strip-scroll">
            <button
              v-for="a in onlineArtists"
              :key="a.id"
              type="button"
              class="artist-card"
              @click="goArtist(a)"
            >
              <CoverImage
                :src="a.pic_url"
                alt=""
                :size="44"
                :radius="22"
                variant="artist"
                class="artist-avatar-cover"
              />
              <div class="artist-name" :title="a.name">{{ a.name }}</div>
            </button>
          </div>
        </div>
      </template>
      <template #loading>
        <el-skeleton :rows="5" animated />
      </template>
      <template #empty>
        <el-empty :description="t('onlineMusic.empty')" />
      </template>
      <template #actions="{ item }">
        <el-tooltip :content="t('common.download')" placement="top">
          <el-button
            circle
            size="small"
            :icon="Download"
            link
            :aria-label="t('common.download')"
            @click="emit('download', onlineSongs[item.sourceIndex])"
          />
        </el-tooltip>
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => handleAddToPlaylist(cmd, onlineSongs[item.sourceIndex])
          "
        >
          <el-tooltip :content="t('playlist.addToPlaylist')" placement="top">
            <el-button
              circle
              size="small"
              :icon="Plus"
              link
              :aria-label="t('playlist.addToPlaylist')"
            />
          </el-tooltip>
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
    </TrackList>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

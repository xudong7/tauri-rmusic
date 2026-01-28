<script setup lang="ts">
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

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="onlineSongs.length === 0" class="empty-list">
      <el-empty :description="t('onlineMusic.empty')" />
    </div>

    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
        <div v-if="onlineArtists?.length" class="artist-strip">
          <div class="artist-strip-title">{{ t("common.artist") }}</div>
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
      <div v-if="totalCount > onlineSongs.length" class="load-more">
        <el-button @click="emit('load-more')" type="primary" plain>{{
          t("onlineMusic.loadMore")
        }}</el-button>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

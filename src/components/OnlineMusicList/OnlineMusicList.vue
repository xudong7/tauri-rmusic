<script setup lang="ts">
import { CaretRight, VideoPause, Download, Headset } from "@element-plus/icons-vue";
import type { SongInfo } from "@/types/model";
import { formatDuration, formatArtists } from "@/utils/songUtils";

const props = defineProps<{
  onlineSongs: SongInfo[];
  currentSong: SongInfo | null;
  isPlaying: boolean;
  loading: boolean;
  totalCount: number;
}>();

const emit = defineEmits(["play", "download", "load-more"]);

const isCurrentSong = (s: SongInfo) => props.currentSong?.id === s.id;
</script>

<template>
  <div class="online-music-list-container">
    <h2 class="list-title">在线音乐</h2>

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="onlineSongs.length === 0" class="empty-list">
      <el-empty description="搜索歌曲开始播放" />
    </div>

    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
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
        <el-button @click="emit('load-more')" type="primary" plain>加载更多</el-button>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

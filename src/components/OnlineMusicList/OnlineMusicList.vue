<script setup lang="ts">
import { CaretRight, VideoPause, Download } from "@element-plus/icons-vue";
import type { SongInfo } from "../types/model";

const props = defineProps<{
  onlineSongs: SongInfo[];
  currentSong: SongInfo | null;
  isPlaying: boolean;
  loading: boolean;
  totalCount: number;
}>();

const emit = defineEmits(["play", "download", "load-more"]);

// 格式化时长
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 格式化艺术家列表
function formatArtists(artists: string[]): string {
  return artists.join(", ");
}

// 是否为当前播放的歌曲
const isCurrentSong = (song: SongInfo) => {
  return props.currentSong && props.currentSong.id === song.id;
};
</script>

<template>
  <div class="online-music-list-container">
    <h2 class="list-title">在线音乐</h2>

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="onlineSongs.length === 0" class="empty-list">
      <el-empty description="暂无搜索结果" />
    </div>

    <el-scrollbar v-else class="music-scrollbar">
      <el-table
        :data="onlineSongs"
        style="width: 100%"
        :row-class-name="(row) => (isCurrentSong(row) ? 'current-playing' : '')"
      >
        <el-table-column width="60">
          <template #default="{ row }">
            <el-button
              circle
              size="small"
              @click="emit('play', row)"
              :type="isCurrentSong(row) ? 'primary' : 'default'"
              :icon="isCurrentSong(row) && isPlaying ? VideoPause : CaretRight"
            />
          </template>
        </el-table-column>

        <el-table-column label="歌名" min-width="120">
          <template #default="{ row }">
            <div
              :class="{ 'playing-song': isCurrentSong(row) }"
              class="song-name"
            >
              {{ row.name }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="歌手" min-width="150">
          <template #default="{ row }">
            <div class="ellipsis-text">
              {{ formatArtists(row.artists) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="专辑" min-width="150">
          <template #default="{ row }">
            <div class="ellipsis-text">
              {{ row.album }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="时长" width="80">
          <template #default="{ row }">
            {{ formatDuration(row.duration) }}
          </template>
        </el-table-column>

        <el-table-column width="80">
          <template #default="{ row }">
            <el-button
              circle
              size="small"
              @click="emit('download', row)"
              :icon="Download"
              type="success"
            />
          </template>
        </el-table-column>
      </el-table>

      <div v-if="totalCount > onlineSongs.length" class="load-more">
        <el-button @click="emit('load-more')" type="primary" plain
          >加载更多</el-button
        >
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

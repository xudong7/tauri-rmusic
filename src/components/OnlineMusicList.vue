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

        <el-table-column label="歌曲名" min-width="200">
          <template #default="{ row }">
            <div
              :class="{ 'playing-song': isCurrentSong(row) }"
              class="song-name"
            >
              {{ row.name }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="艺术家" min-width="150">
          <template #default="{ row }">
            {{ formatArtists(row.artists) }}
          </template>
        </el-table-column>

        <el-table-column label="专辑" min-width="150">
          <template #default="{ row }">
            {{ row.album }}
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

<style scoped>
.online-music-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-title {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  font-size: 18px;
}

.music-scrollbar {
  flex: 1;
  height: calc(100% - 40px);
  overflow: hidden;
}

.loading-container,
.empty-list {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.playing-song {
  font-weight: bold;
  color: var(--el-color-primary);
}

.current-playing {
  background-color: var(--active-item-bg, rgba(64, 158, 255, 0.1));
}

.song-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.load-more {
  text-align: center;
  margin: 20px 0;
}

/* 暗色主题适配 */
:deep(.el-table) {
  --el-table-header-bg-color: var(--el-bg-color);
  --el-table-border-color: var(--el-border-color);
  --el-table-header-text-color: var(--el-text-color-secondary);
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

:deep(.el-table th.el-table__cell) {
  background-color: var(--el-bg-color);
}

:deep(.el-table tr) {
  background-color: var(--el-bg-color);
}

:deep(.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background-color: var(--hover-bg-color, #f5f7fa);
}

:deep(.el-table__body tr.current-playing td.el-table__cell) {
  background-color: var(--active-item-bg, rgba(64, 158, 255, 0.1));
}

/* 按钮样式优化 */
:deep(.el-button--success) {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

:deep(.el-button--success:hover) {
  background-color: var(--el-color-primary-light-3);
  border-color: var(--el-color-primary-light-3);
}
</style>

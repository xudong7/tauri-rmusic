<script setup lang="ts">
import { CaretRight, VideoPause } from "@element-plus/icons-vue";
import type { MusicFile } from "../types/model";

const props = defineProps<{
  musicFiles: Array<MusicFile>;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
}>();

const emit = defineEmits(["play"]);

// 获取文件名（不含路径）
function getFileName(path: string): string {
  const parts = path.split(/[\/\\]/);
  return parts[parts.length - 1];
}

// 获取不带扩展名的文件名
function getDisplayName(path: string): string {
  const fileName = getFileName(path);
  return fileName.replace(/\.[^/.]+$/, "");
}

// 是否为当前播放的歌曲
const isCurrentMusic = (music: MusicFile) => {
  return props.currentMusic && props.currentMusic.id === music.id;
};
</script>

<template>
  <div class="music-list-container">
    <h2 class="list-title">音乐列表</h2>

    <div v-if="musicFiles.length === 0" class="empty-list">
      <el-empty description="暂无音乐文件" />
    </div>

    <el-scrollbar v-else class="music-scrollbar">
      <el-table
        :data="musicFiles"
        style="width: 100%"
        :row-class-name="
          (row) => (isCurrentMusic(row) ? 'current-playing' : '')
        "
        height="100%"
      >
        <el-table-column width="60">
          <template #default="{ row }">
            <el-button
              circle
              size="small"
              @click="emit('play', row)"
              :type="isCurrentMusic(row) ? 'primary' : 'default'"
              :icon="isCurrentMusic(row) && isPlaying ? VideoPause : CaretRight"
            />
          </template>
        </el-table-column>

        <el-table-column label="ID" prop="id" width="80" />

        <el-table-column label="歌曲名">
          <template #default="{ row }">
            <div
              :class="{ 'playing-song': isCurrentMusic(row) }"
              class="song-name"
            >
              {{ getDisplayName(row.file_name) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="文件路径" min-width="100">
          <template #default="{ row }">
            <span class="file-path">{{ row.file_name }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />


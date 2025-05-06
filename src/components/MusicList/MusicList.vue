<script setup lang="ts">
import { CaretRight, VideoPause } from "@element-plus/icons-vue";
import type { MusicFile } from "../../types/model";

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

// 从歌曲名中提取"-"前面的部分（歌手名）
function extractArtistName(fullName: string): string {
  if (!fullName) return "未知歌手";
  const match = fullName.match(/^(.+?)\s*-\s*.+$/);
  return match ? match[1].trim() : "未知歌手";
}

// 从歌曲名中提取"-"后面的部分
function extractSongTitle(fullName: string): string {
  if (!fullName) return "未知歌曲";
  const match = fullName.match(/\s*-\s*(.+)$/);
  return match ? match[1].trim() : fullName;
}

// 获取美化后的显示名称
function getFormattedName(path: string): string {
  const displayName = getDisplayName(path);
  return extractSongTitle(displayName);
}

// 是否为当前播放的歌曲
const isCurrentMusic = (music: MusicFile) => {
  return props.currentMusic && props.currentMusic.id === music.id;
};

// 双击行播放音乐
function handleRowDblClick(row: MusicFile) {
  emit('play', row);
}
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
        @row-dblclick="handleRowDblClick"
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

        <el-table-column label="ID" prop="id" width="60" />

        <el-table-column label="歌名" min-width="120">
          <template #default="{ row }">
            <div
              :class="{ 'playing-song': isCurrentMusic(row) }"
              class="song-name"
            >
              {{ extractSongTitle(getDisplayName(row.file_name)) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="歌手" min-width="150">
          <template #default="{ row }">
            <span class="artist-name">
              {{ extractArtistName(getDisplayName(row.file_name)) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="文件路径" min-width="180">
          <template #default="{ row }">
            <span class="file-path">{{ row.file_name }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />


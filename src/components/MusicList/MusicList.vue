<script setup lang="ts">
import { CaretRight, VideoPause, Headset } from "@element-plus/icons-vue";
import type { MusicFile } from "../../types/model";

const props = defineProps<{
  musicFiles: Array<MusicFile>;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
}>();

const emit = defineEmits(["play"]);

function getFileName(path: string): string {
  const parts = path.split(/[\/\\]/);
  return parts[parts.length - 1];
}

function getDisplayName(path: string): string {
  return getFileName(path).replace(/\.[^/.]+$/, "");
}

function extractArtistName(fullName: string): string {
  if (!fullName) return "未知歌手";
  const match = fullName.match(/^(.+?)\s*-\s*.+$/);
  return match ? match[1].trim() : "未知歌手";
}

function extractSongTitle(fullName: string): string {
  if (!fullName) return "未知歌曲";
  const match = fullName.match(/\s*-\s*(.+)$/);
  return match ? match[1].trim() : fullName;
}

const isCurrentMusic = (music: MusicFile) =>
  props.currentMusic != null && props.currentMusic.id === music.id;

function handleRowDblClick(row: MusicFile) {
  emit("play", row);
}
</script>

<template>
  <div class="music-list-container">
    <h2 class="list-title">音乐列表</h2>

    <div v-if="musicFiles.length === 0" class="empty-list">
      <el-empty description="暂无音乐，点击「导入音乐」添加" />
    </div>

    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
        <div
          v-for="row in musicFiles"
          :key="row.id"
          class="list-row"
          :class="{ 'is-current': isCurrentMusic(row) }"
          :title="row.file_name"
          @dblclick="handleRowDblClick(row)"
        >
          <div class="col-play">
            <el-button
              circle
              size="small"
              :type="isCurrentMusic(row) ? 'primary' : 'default'"
              :icon="isCurrentMusic(row) && isPlaying ? VideoPause : CaretRight"
              @click="emit('play', row)"
            />
          </div>
          <div class="col-cover">
            <div class="cover-placeholder">
              <el-icon><Headset /></el-icon>
            </div>
          </div>
          <div class="col-main">
            <div class="song-title" :class="{ 'is-playing': isCurrentMusic(row) }">
              {{ extractSongTitle(getDisplayName(row.file_name)) }}
            </div>
            <div class="song-artist">
              {{ extractArtistName(getDisplayName(row.file_name)) }}
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />

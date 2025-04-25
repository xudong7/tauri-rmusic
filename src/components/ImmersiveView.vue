<script setup lang="ts">
import { ref, computed } from "vue";
import { VideoPlay, VideoPause, Back, ArrowLeft, ArrowRight, Headset } from "@element-plus/icons-vue";
import type { SongInfo, MusicFile } from "../types/model";
import LyricView from "./LyricView.vue";
import { invoke } from "@tauri-apps/api/core";

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  currentTime: number; // 当前播放时间（毫秒）
}>();

const emit = defineEmits(["toggle-play", "previous", "next", "exit"]);

// 本地音乐封面
const localCoverUrl = ref('');

// 加载本地封面和歌词
async function loadLocalCoverAndLyric() {
  if (props.currentMusic) {
    try {
      const [coverData, _] = await invoke("load_cover_and_lyric", {
        fileName: props.currentMusic.file_name
      });
      
      if (coverData) {
        localCoverUrl.value = coverData;
      } else {
        localCoverUrl.value = '';
      }
    } catch (error) {
      console.error("加载本地封面失败:", error);
      localCoverUrl.value = '';
    }
  } else {
    localCoverUrl.value = '';
  }
}

// 组件挂载时加载本地封面
if (props.currentMusic) {
  loadLocalCoverAndLyric();
}

// 获取不带扩展名的文件名（本地文件）
function getFileName(path: string): string {
  if (!path) return "未知歌曲";
  const parts = path.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^/.]+$/, "");
}

// 格式化艺术家列表
function formatArtists(artists: string[]): string {
  return artists ? artists.join(", ") : "";
}

// 格式化当前播放时间
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 格式化总时长
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 当前歌曲名称
const currentSongName = computed(() => {
  if (props.currentSong) {
    return props.currentSong.name;
  } else if (props.currentMusic) {
    return getFileName(props.currentMusic.file_name);
  }
  return "未知歌曲";
});

// 当前艺术家
const currentArtistName = computed(() => {
  if (props.currentSong) {
    return formatArtists(props.currentSong.artists);
  }
  return "";
});

// 当前封面
const currentCoverUrl = computed(() => {
  if (props.currentSong && props.currentSong.pic_url) {
    return props.currentSong.pic_url;
  } else if (localCoverUrl.value) {
    return localCoverUrl.value;
  }
  return null;
});

// 进度百分比
const progressPercentage = computed(() => {
  if (!props.currentTime) return 0;
  
  if (props.currentSong) {
    return (props.currentTime / props.currentSong.duration) * 100;
  }
  
  // 本地音乐没有直接的持续时间信息，这里返回一个估算值
  // 假设一般歌曲持续时间为4分钟
  const estimatedDuration = 4 * 60 * 1000;
  return Math.min((props.currentTime / estimatedDuration) * 100, 100);
});

// 估算的总时长（用于本地音乐）
const estimatedDuration = computed(() => {
  if (props.currentSong) {
    return formatDuration(props.currentSong.duration);
  }
  
  // 本地音乐估算4分钟
  return "4:00";
});
</script>

<template>
  <div class="immersive-view">
    <div class="top-section">
      <el-button @click="emit('exit')" :icon="Back" circle class="back-btn" />
    </div>

    <div class="content-section">
      <div class="cover-container">
        <img
          v-if="currentCoverUrl"
          :src="currentCoverUrl"
          class="song-cover"
          alt="封面"
        />
        <div v-else class="no-cover">
          <el-icon><Headset /></el-icon>
        </div>
      </div>

      <div class="song-info">
        <h2 class="song-title">{{ currentSongName }}</h2>
        <p v-if="currentArtistName" class="song-artist">
          {{ currentArtistName }}
        </p>
      </div>

      <div class="lyric-view-container">
        <LyricView
          :currentSong="currentSong"
          :currentMusic="currentMusic"
          :currentTime="currentTime"
          :isPlaying="isPlaying"
        />
      </div>
    </div>

    <div class="control-section">
      <div class="time-display">
        <span>{{ formatTime(currentTime) }}</span>
        <div class="progress-bar">
          <div
            class="progress-inner"
            :style="{ width: `${progressPercentage}%` }"
          ></div>
        </div>
        <span>{{ estimatedDuration }}</span>
      </div>

      <div class="controls">
        <el-button
          circle
          :icon="ArrowLeft"
          @click="emit('previous')"
        />

        <el-button
          circle
          size="large"
          :icon="isPlaying ? VideoPause : VideoPlay"
          @click="emit('toggle-play')"
          type="primary"
        />

        <el-button
          circle
          :icon="ArrowRight"
          @click="emit('next')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.immersive-view {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.top-section {
  padding: 20px;
  display: flex;
  justify-content: flex-start;
}

.back-btn {
  background: rgba(255, 255, 255, 0.3);
  border: none;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.content-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40px;
  overflow: hidden;
}

.cover-container {
  width: 240px;
  height: 240px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  margin-bottom: 24px;
}

.song-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-cover {
  width: 100%;
  height: 100%;
  background-color: #e0e0e0;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 60px;
  color: #909399;
}

.song-info {
  text-align: center;
  margin-bottom: 20px;
}

.song-title {
  margin: 0;
  font-size: 24px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.song-artist {
  margin: 8px 0 0 0;
  font-size: 16px;
  color: #606266;
}

.lyric-view-container {
  flex: 1;
  width: 100%;
  max-width: 500px;
  overflow: hidden;
}

.control-section {
  padding: 20px 40px 40px;
}

.time-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #606266;
  font-size: 14px;
  margin-bottom: 20px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  margin: 0 12px;
  overflow: hidden;
}

.progress-inner {
  height: 100%;
  background-color: #409eff;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
}
</style>

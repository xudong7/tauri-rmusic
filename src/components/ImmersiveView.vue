<script setup lang="ts">
import { ref, computed, watch } from "vue";
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

// 图片亮度分析状态
const imageAnalysisState = ref({
  brightness: 0.7, // 默认亮度
  isAnalyzing: false,
  isAnalyzed: false
});

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

// 分析图片亮度
async function analyzeCoverBrightness(imageUrl: string) {
  if (!imageUrl || imageAnalysisState.value.isAnalyzing) return;
  
  imageAnalysisState.value.isAnalyzing = true;
  
  try {
    // 创建一个隐藏的图片元素来加载图片
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    // 使用 canvas 分析图片亮度
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 计算平均亮度 (0-255)
    let totalBrightness = 0;
    let count = 0;
    
    // 每隔几个像素采样一次，提高性能
    const sampleStep = Math.max(1, Math.floor(data.length / 4 / 1000));
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // 加权亮度计算 (人眼对绿色最敏感)
      const pixelBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += pixelBrightness;
      count++;
    }
    
    // 计算平均亮度并归一化到 0-1 范围
    const averageBrightness = totalBrightness / count / 255;
    
    // 根据图片亮度计算合适的背景亮度值
    // 亮图片需要降低背景亮度，暗图片需要提高背景亮度
    let adjustedBrightness;
    
    if (averageBrightness < 0.3) {
      // 暗图片，稍微提高亮度
      adjustedBrightness = 0.9;
    } else if (averageBrightness < 0.6) {
      // 中等亮度，适中调整
      adjustedBrightness = 0.7;
    } else {
      // 亮图片，降低亮度
      adjustedBrightness = 0.5;
    }
    
    imageAnalysisState.value.brightness = adjustedBrightness;
    imageAnalysisState.value.isAnalyzed = true;
  } catch (error) {
    console.error("分析封面图片亮度失败:", error);
    // 使用默认值
    imageAnalysisState.value.brightness = 0.7;
  } finally {
    imageAnalysisState.value.isAnalyzing = false;
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

// 用于背景的模糊封面样式
const backgroundStyle = computed(() => {
  if (currentCoverUrl.value) {
    return {
      backgroundImage: `url(${currentCoverUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    };
  }
  return {};
});

// 背景滤镜样式
const backgroundFilterStyle = computed(() => {
  return `blur(30px) brightness(${imageAnalysisState.value.brightness})`;
});

// 覆盖层透明度样式
const overlayStyle = computed(() => {
  // 根据图片亮度调整覆盖层透明度
  // 亮图片需要更暗的覆盖层，暗图片需要更透明的覆盖层
  let opacity;
  
  if (imageAnalysisState.value.brightness > 0.8) {
    // 如果背景很亮，覆盖层应该更暗
    opacity = 0.8;
  } else if (imageAnalysisState.value.brightness > 0.6) {
    // 中等亮度
    opacity = 0.7;
  } else {
    // 背景较暗，覆盖层应该更透明
    opacity = 0.6;
  }
  
  return {
    background: `linear-gradient(to bottom, 
      rgba(0, 0, 0, ${opacity * 0.6}) 0%, 
      rgba(0, 0, 0, ${opacity * 0.8}) 50%,
      rgba(0, 0, 0, ${opacity * 0.9}) 100%)`
  };
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

watch (
  // 监听 更新cover
  () => props.currentMusic,
  (newVal) => {
    if (newVal) {
      loadLocalCoverAndLyric();
    }
  },
  { immediate: true }
);

// 监听封面URL变化，重新分析亮度
watch(
  () => currentCoverUrl.value,
  (newUrl) => {
    if (newUrl) {
      imageAnalysisState.value.isAnalyzed = false;
      analyzeCoverBrightness(newUrl);
    }
  },
  { immediate: true }
);

</script>

<template>
  <div class="immersive-view">
    <div v-if="currentCoverUrl" class="background-cover" :style="[backgroundStyle, { filter: backgroundFilterStyle }]"></div>
    <div class="overlay" :style="overlayStyle"></div>
    
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
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeIn 0.3s ease;
  color: var(--el-text-color-primary);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.background-cover {
  position: absolute;
  top: -10px;
  left: -10px;
  width: calc(100% + 20px);
  height: calc(100% + 20px);
  transform: scale(1.10);
  z-index: -2;
  transition: all 1.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

.top-section {
  position: relative;
  padding: 20px;
  display: flex;
  justify-content: flex-start;
  z-index: 1;
}

.back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--el-text-color-primary);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: var(--el-color-primary);
}

.content-section {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40px;
  overflow: hidden;
  z-index: 1;
}

.cover-container {
  width: 280px;
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6);
  margin-bottom: 28px;
  transition: transform 0.5s cubic-bezier(0.21, 1.02, 0.73, 1);
  position: relative;
}

.cover-container:hover {
  transform: scale(1.05) translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
}

.song-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s ease;
}

.song-cover:hover {
  transform: scale(1.1);
}

.no-cover {
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 60px;
  color: var(--el-text-color-secondary);
}

.song-info {
  text-align: center;
  margin-bottom: 20px;
  animation: slideUp 0.6s ease forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.song-title {
  margin: 0;
  font-size: 24px;
  color: #fff;
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 600px;
  position: relative;
  display: inline-block;
  padding-bottom: 5px;
}

.song-title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--el-color-primary), transparent);
  transform: translateX(-50%);
  transition: width 0.3s ease;
}

.song-title:hover::after {
  width: 80%;
}

.song-artist {
  margin: 8px 0 0 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  transition: color 0.3s ease;
}

.song-info:hover .song-artist {
  color: var(--el-color-primary-light-5);
}

.lyric-view-container {
  flex: 1;
  width: 100%;
  max-width: 500px;
  overflow: hidden;
}

.control-section {
  position: relative;
  padding: 20px 40px 40px;
  z-index: 1;
}

.time-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin-bottom: 20px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  margin: 0 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: height 0.2s ease;
}

.progress-bar:hover {
  height: 6px;
}

.progress-inner {
  height: 100%;
  background: linear-gradient(90deg, var(--el-color-primary), var(--el-color-primary-light-3));
  border-radius: 4px;
  transition: width 0.1s linear;
  position: relative;
}

.progress-inner::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background-color: #fff;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.progress-bar:hover .progress-inner::after {
  opacity: 1;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 10px;
}

.controls .el-button {
  background-color: rgba(255, 255, 255, 0.1);
  border-color: transparent;
  color: #fff;
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  transform: translateY(0);
}

.controls .el-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
  color: var(--el-color-primary);
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.controls .el-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.controls .el-button--primary {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transform: scale(1);
}

.controls .el-button--primary:hover {
  background-color: var(--el-color-primary-light-3);
  border-color: var(--el-color-primary-light-3);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.controls .el-button--primary:active {
  transform: scale(1);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
}
</style>

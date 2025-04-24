<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Mute,
  Headset,
} from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";

const props = defineProps<{
  currentMusic: MusicFile | null;
  isPlaying: boolean;
}>();

const emit = defineEmits(["toggle-play", "volume-change", "next", "previous"]);

// 音量
const volume = ref(50);

// 获取不带扩展名的文件名
function getFileName(path: string): string {
  if (!path) return "未选择歌曲";
  const parts = path.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^/.]+$/, "");
}

// 当前播放的歌曲名
const currentSongName = computed(() => {
  return props.currentMusic
    ? getFileName(props.currentMusic.file_name)
    : "未选择歌曲";
});

// 处理音量变化
function handleVolumeChange() {
  emit("volume-change", volume.value);
}

// 监听音量变化
watch(volume, () => {
  handleVolumeChange();
});
</script>

<template>
  <div class="player-bar">
    <div class="player-controls">
      <el-button
        circle
        :icon="ArrowLeft"
        :disabled="!currentMusic"
        @click="emit('previous')"
      />

      <el-button
        circle
        size="large"
        :icon="isPlaying ? VideoPause : VideoPlay"
        :disabled="!currentMusic"
        @click="emit('toggle-play')"
        type="primary"
      />

      <el-button
        circle
        :icon="ArrowRight"
        :disabled="!currentMusic"
        @click="emit('next')"
      />
    </div>

    <div class="song-info">
      <el-icon v-if="isPlaying" class="playing-icon"><Headset /></el-icon>
      <el-icon v-else><Mute /></el-icon>
      <span class="song-name">{{ currentSongName }}</span>
    </div>

    <div class="volume-control">
      <span class="volume-label">音量:</span>
      <el-slider
        v-model="volume"
        :max="100"
        :min="0"
        :step="1"
        show-tooltip
        height="6px"
        style="width: 120px"
      />
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  height: 80px;
  background-color: #f5f7fa;
  border-top: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.song-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.song-name {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-icon {
  color: #409eff;
  animation: pulsate 1.5s infinite;
}

@keyframes pulsate {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.volume-label {
  color: #606266;
  font-size: 14px;
}
</style>

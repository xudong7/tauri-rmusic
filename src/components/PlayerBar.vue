<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Headset,
} from "@element-plus/icons-vue";
import type { MusicFile, SongInfo } from "@/types/model";

const props = defineProps<{
  currentMusic: MusicFile | null;
  currentOnlineSong: SongInfo | null;
  isPlaying: boolean;
  currentTime: number; // 当前播放时间（毫秒）
}>();

const emit = defineEmits([
  "toggle-play",
  "volume-change",
  "next",
  "previous",
  "show-immersive",
]);

// 音量
const volume = ref(50);

// 获取不带扩展名的文件名（本地文件）
function getFileName(path: string): string {
  if (!path) return "未选择歌曲";
  const parts = path.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^/.]+$/, "");
}

// 当前播放的歌曲名
const currentSongName = computed(() => {
  // 优先显示在线歌曲信息
  if (props.currentOnlineSong) {
    return props.currentOnlineSong.name;
  }

  // 否则显示本地歌曲信息
  return props.currentMusic
    ? getFileName(props.currentMusic.file_name)
    : "未选择歌曲";
});

// 当前艺术家
const currentArtist = computed(() => {
  if (props.currentOnlineSong && props.currentOnlineSong.artists.length) {
    return props.currentOnlineSong.artists.join(", ");
  }
  return "";
});

// 当前封面
const coverUrl = computed(() => {
  if (props.currentOnlineSong && props.currentOnlineSong.pic_url) {
    return props.currentOnlineSong.pic_url;
  }
  
  if (props.currentMusic && localCoverUrl.value) {
    return localCoverUrl.value;
  }
  
  return null;
});

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

// 监听当前歌曲变化，加载本地封面
watch(
  () => props.currentMusic,
  (newMusic) => {
    if (newMusic) {
      loadLocalCoverAndLyric();
    } else {
      localCoverUrl.value = '';
    }
  },
  { immediate: true }
);

// 处理音量变化
function handleVolumeChange() {
  emit("volume-change", volume.value);
}

// 进入沉浸模式
function enterImmersiveMode() {
  // 只要有当前歌曲（在线或本地）就可以进入沉浸模式
  if (props.currentOnlineSong || props.currentMusic) {
    emit("show-immersive");
  }
}

// 监听音量变化
watch(volume, () => {
  handleVolumeChange();
});
</script>

<template>
  <div class="player-bar">
    <div class="player-left">
      <div
        class="cover-container"
        @click="enterImmersiveMode"
        :class="{ clickable: currentOnlineSong || currentMusic }"
      >
        <img
          v-if="coverUrl"
          :src="coverUrl"
          class="cover-image"
          alt="Album Cover"
        />
        <div v-else class="no-cover">
          <el-icon style="width: 100%; height: 100%; object-fit: cover"
            ><Headset
          /></el-icon>
        </div>
      </div>

      <div class="song-info">
        <div class="song-name">{{ currentSongName }}</div>
        <div v-if="currentArtist" class="artist-name">{{ currentArtist }}</div>
      </div>
    </div>

    <div class="player-controls">
      <el-button
        circle
        :icon="ArrowLeft"
        :disabled="!currentMusic && !currentOnlineSong"
        @click="emit('previous')"
      />

      <el-button
        circle
        size="large"
        :icon="isPlaying ? VideoPause : VideoPlay"
        :disabled="!currentMusic && !currentOnlineSong"
        @click="emit('toggle-play')"
        type="primary"
      />

      <el-button
        circle
        :icon="ArrowRight"
        :disabled="!currentMusic && !currentOnlineSong"
        @click="emit('next')"
      />
    </div>

    <div class="volume-control">
      <!-- <span class="volume-label">音量:</span> -->
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

.player-left {
  display: flex;
  align-items: center;
  width: 40%;
  @media (max-width: 320px) {
    display: none;
  }
}

.cover-container {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  margin-right: 12px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.clickable:hover {
  transform: scale(1.05);
}

.cover-image {
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
  font-size: 24px;
  color: #909399;
}

.song-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.song-name {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist-name {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 45%;
  @media (max-width: 320px) {
    min-width: 100%;
  }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 15%;
  @media (max-width: 480px) {
    display: none;
  }
}

.volume-label {
  color: #606266;
  font-size: 14px;
}
</style>

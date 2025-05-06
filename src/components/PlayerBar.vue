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
const localCoverUrl = ref("");

// 加载本地封面和歌词
async function loadLocalCoverAndLyric() {
  if (props.currentMusic) {
    try {
      const [coverData, _] = await invoke("load_cover_and_lyric", {
        fileName: props.currentMusic.file_name,
      });

      if (coverData) {
        localCoverUrl.value = coverData;
      } else {
        localCoverUrl.value = "";
      }
    } catch (error) {
      console.error("加载本地封面失败:", error);
      localCoverUrl.value = "";
    }
  } else {
    localCoverUrl.value = "";
  }
}

// 监听当前歌曲变化，加载本地封面
watch(
  () => props.currentMusic,
  (newMusic) => {
    if (newMusic) {
      loadLocalCoverAndLyric();
    } else {
      localCoverUrl.value = "";
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
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  transition: all 0.3s ease;

  /* 亮色模式样式 */
  background-color: rgba(245, 245, 247, 0.95);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--el-text-color-primary);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}

/* 深色模式样式 */
html.dark .player-bar {
  background-color: rgba(30, 30, 32, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
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
  border-radius: 10px;
  overflow: hidden;
  margin-right: 16px;
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);

  /* 亮色模式 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 深色模式 */
html.dark .cover-container {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.clickable {
  cursor: pointer;
}

.clickable:hover {
  transform: translateY(-3px) scale(1.08);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.cover-container:hover .cover-image {
  transform: scale(1.1);
}

.no-cover {
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  color: var(--el-text-color-secondary);
}

.song-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.3s ease;
}

.player-left:hover .song-info {
  transform: translateX(4px);
}

.song-name {
  font-size: 16px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s ease;

  /* 亮色模式 */
  color: var(--el-text-color-primary);
  text-shadow: none;
}

/* 深色模式 */
html.dark .song-name {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.player-left:hover .song-name {
  color: var(--el-color-primary);
}

.artist-name {
  font-size: 13px;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s ease;

  /* 亮色模式 */
  color: var(--el-text-color-secondary);
}

/* 深色模式 */
html.dark .artist-name {
  color: rgba(255, 255, 255, 0.7);
}

.player-left:hover .artist-name {
  /* 亮色模式 */
  color: var(--el-text-color-primary);
}

/* 深色模式 */
html.dark .player-left:hover .artist-name {
  color: rgba(255, 255, 255, 0.9);
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 45%;
  justify-content: center;
  @media (max-width: 320px) {
    min-width: 100%;
  }
}

.player-controls .el-button {
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  transform: translateY(0);
  border-color: transparent;

  /* 亮色模式 */
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--el-text-color-primary);
}

/* 深色模式 */
html.dark .player-controls .el-button {
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.player-controls .el-button:hover {
  transform: translateY(-3px);

  /* 亮色模式 */
  background-color: rgba(0, 0, 0, 0.08);
  color: var(--el-color-primary);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

/* 深色模式 */
html.dark .player-controls .el-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.player-controls .el-button:active {
  transform: translateY(0);

  /* 亮色模式 */
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

/* 深色模式 */
html.dark .player-controls .el-button:active {
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.player-controls .el-button.is-disabled {
  transform: none;
  box-shadow: none;

  /* 亮色模式 */
  color: var(--el-disabled-text-color);
  background-color: rgba(0, 0, 0, 0.02);
  border-color: transparent;
}

/* 深色模式 */
html.dark .player-controls .el-button.is-disabled {
  color: rgba(255, 255, 255, 0.3);
  background-color: rgba(255, 255, 255, 0.05);
}

.player-controls .el-button--primary {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
  transform: scale(1);

  /* 亮色模式 */
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
}

/* 深色模式 */
html.dark .player-controls .el-button--primary {
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.player-controls .el-button--primary:hover {
  background-color: var(--el-color-primary-light-3);
  border-color: var(--el-color-primary-light-3);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.player-controls .el-button--primary:active {
  transform: scale(1);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
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
  font-size: 14px;

  /* 亮色模式 */
  color: var(--el-text-color-secondary);
}

/* 深色模式 */
html.dark .volume-label {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.el-slider__runway) {
  height: 4px;
  transition: height 0.2s ease;

  /* 亮色模式 */
  background-color: rgba(0, 0, 0, 0.1);
}

/* 深色模式 */
html.dark :deep(.el-slider__runway) {
  background-color: rgba(255, 255, 255, 0.2);
}

:deep(.el-slider__bar) {
  background-color: var(--el-color-primary);
  background-image: linear-gradient(
    90deg,
    var(--el-color-primary),
    var(--el-color-primary-light-3)
  );
}

:deep(.el-slider__button) {
  width: 12px;
  height: 12px;
  border: none;
  background-color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: all 0.3s ease;
}

:deep(.el-slider:hover .el-slider__button) {
  transform: scale(1.2);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
}
</style>

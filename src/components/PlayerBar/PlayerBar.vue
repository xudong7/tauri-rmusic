<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Headset,
  Sort,
  Refresh,
} from "@element-plus/icons-vue";
import { PlayMode, type MusicFile, type SongInfo } from "@/types/model";
import { useMusicStore } from "@/stores/musicStore";

const props = defineProps<{
  currentMusic: MusicFile | null;
  currentOnlineSong: SongInfo | null;
  isPlaying: boolean;
  playMode: PlayMode;
}>();

const emit = defineEmits([
  "toggle-play",
  "volume-change",
  "next",
  "previous",
  "toggle-play-mode",
  "show-immersive",
]);

// 使用 musicStore
const musicStore = useMusicStore();

// 音量
const volume = ref(50);

// 获取不带扩展名的文件名（本地文件）
function getFileName(path: string): string {
  if (!path) return "未选择歌曲";
  const parts = path.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^/.]+$/, "");
}

// 从歌曲名中提取"-"后面的部分
function extractSongTitle(fullName: string): string {
  if (!fullName) return "未知歌曲";
  const match = fullName.match(/\s*-\s*(.+)$/);
  return match ? match[1].trim() : fullName;
}

// 从歌曲名中提取"-"前面的部分(歌手名)
function extractArtistName(fullName: string): string {
  if (!fullName) return "";
  const match = fullName.match(/^(.+?)\s*-\s*.+$/);
  return match ? match[1].trim() : "";
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

// 当前歌曲的实际标题（只显示"-"后面的部分）
const songTitle = computed(() => {
  return extractSongTitle(currentSongName.value);
});

// 当前艺术家
const currentArtist = computed(() => {
  // 优先显示在线歌曲的艺术家信息
  if (props.currentOnlineSong && props.currentOnlineSong.artists.length) {
    return props.currentOnlineSong.artists.join(", ");
  }

  // 从本地音乐文件名中提取歌手名
  if (props.currentMusic) {
    const fileName = getFileName(props.currentMusic.file_name);
    const artistName = extractArtistName(fileName);
    return artistName || "未知歌手";
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

  // return null;
  return musicStore.getDefaultCoverUrl();
});

// 本地音乐封面
const localCoverUrl = ref("");

// 加载本地封面和歌词
async function loadLocalCoverAndLyric() {
  if (props.currentMusic) {
    try {
      const result = await invoke("load_cover_and_lyric", {
        fileName: props.currentMusic.file_name,
        defaultDirectory: musicStore.getDefaultDirectory(),
      });

      // Handle the result as array
      if (Array.isArray(result) && result.length > 0) {
        localCoverUrl.value = result[0] || "";
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
          <el-icon
            style="
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <Headset />
          </el-icon>
        </div>
      </div>

      <div class="song-info">
        <div class="song-name" :title="songTitle">{{ songTitle }}</div>
        <div v-if="currentArtist" class="artist-name" :title="currentArtist">
          {{ currentArtist }}
        </div>
      </div>
    </div>

    <div class="player-controls">
      <el-tooltip
        content="上一曲"
        placement="top"
        effect="light"
        :disabled="!currentMusic && !currentOnlineSong"
      >
        <el-button
          circle
          :icon="ArrowLeft"
          :disabled="!currentMusic && !currentOnlineSong"
          @click="emit('previous')"
        />
      </el-tooltip>

      <el-tooltip
        :content="isPlaying ? '暂停' : '播放'"
        placement="top"
        effect="light"
        :disabled="!currentMusic && !currentOnlineSong"
      >
        <el-button
          circle
          size="large"
          :icon="isPlaying ? VideoPause : VideoPlay"
          :disabled="!currentMusic && !currentOnlineSong"
          @click="emit('toggle-play')"
          type="primary"
        />
      </el-tooltip>

      <el-tooltip
        content="下一曲"
        placement="top"
        effect="light"
        :disabled="!currentMusic && !currentOnlineSong"
      >
        <el-button
          circle
          :icon="ArrowRight"
          :disabled="!currentMusic && !currentOnlineSong"
          @click="emit('next')"
        />
      </el-tooltip>
    </div>

    <div class="volume-control">
      <el-slider
        v-model="volume"
        :max="100"
        :min="0"
        :step="1"
        show-tooltip
        height="6px"
        style="width: 120px"
      />
      <el-tooltip
        :content="playMode === PlayMode.SEQUENTIAL ? '顺序播放' : '随机播放'"
        placement="top"
        effect="light"
      >
        <el-button
          circle
          :icon="playMode === PlayMode.SEQUENTIAL ? Sort : Refresh"
          @click="emit('toggle-play-mode')"
          :type="playMode === PlayMode.RANDOM ? 'default' : 'default'"
        />
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped src="./PlayerBar.css" />

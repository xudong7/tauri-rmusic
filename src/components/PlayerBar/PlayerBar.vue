<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { loadLocalCover } from "@/utils/coverUtils";

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

const musicStore = useMusicStore();
const volume = ref(50);
const localCoverUrl = ref("");

const currentSongName = computed(() => {
  if (props.currentOnlineSong) return props.currentOnlineSong.name;
  return props.currentMusic ? getDisplayName(props.currentMusic.file_name) : "未选择歌曲";
});

const songTitle = computed(() => extractSongTitle(currentSongName.value));

const currentArtist = computed(() => {
  if (props.currentOnlineSong?.artists?.length)
    return props.currentOnlineSong.artists.join(", ");
  if (props.currentMusic) {
    const a = extractArtistName(getDisplayName(props.currentMusic.file_name));
    return a || "未知歌手";
  }
  return "";
});

const coverUrl = computed(() => {
  if (props.currentOnlineSong?.pic_url) return props.currentOnlineSong.pic_url;
  if (props.currentMusic && localCoverUrl.value) return localCoverUrl.value;
  return musicStore.getDefaultCoverUrl();
});

async function loadCover() {
  if (!props.currentMusic) {
    localCoverUrl.value = "";
    return;
  }
  localCoverUrl.value = await loadLocalCover(props.currentMusic.file_name, () =>
    musicStore.getDefaultDirectory()
  );
}

watch(
  () => props.currentMusic,
  (v) => (v ? loadCover() : (localCoverUrl.value = "")),
  {
    immediate: true,
  }
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
    <div class="player-row">
      <div class="player-left">
        <div
          class="cover-container"
          @click="enterImmersiveMode"
          :class="{ clickable: currentOnlineSong || currentMusic }"
        >
          <img v-if="coverUrl" :src="coverUrl" class="cover-image" alt="Album Cover" />
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
  </div>
</template>

<style scoped src="./PlayerBar.css" />

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Sort,
  Refresh,
  RefreshRight,
} from "@element-plus/icons-vue";
import { PlayMode, type MusicFile, type SongInfo } from "@/types/model";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { useArtistStore } from "@/stores/artistStore";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";

const { t, locale } = useI18n();

const props = defineProps<{
  currentMusic: MusicFile | null;
  currentOnlineSong: SongInfo | null;
  isPlaying: boolean;
  playMode: PlayMode;
  currentPlayTime: number;
  currentTrackDuration: number;
}>();

const emit = defineEmits([
  "toggle-play",
  "volume-change",
  "next",
  "previous",
  "toggle-play-mode",
  "show-immersive",
  "seek",
]);

const volume = ref(50);
const sliderValue = ref(0);
const isDragging = ref(false);
const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();

const currentSongName = computed(() => {
  void locale.value;
  if (props.currentOnlineSong) return props.currentOnlineSong.name;
  return props.currentMusic
    ? getDisplayName(props.currentMusic.file_name)
    : t("playerBar.noSong");
});

const songTitle = computed(() => extractSongTitle(currentSongName.value));

const currentArtistDisplay = computed(() => {
  void locale.value;
  if (props.currentOnlineSong?.artists?.length)
    return props.currentOnlineSong.artists.join(", ");
  if (props.currentMusic) {
    const a = extractArtistName(getDisplayName(props.currentMusic.file_name));
    return a || t("common.unknownArtist");
  }
  return "";
});

const { artistNames, canNavigateArtist, navigateArtistByName } = useArtistNavigation({
  currentOnlineSong: () => props.currentOnlineSong,
  localArtistDisplay: () => currentArtistDisplay.value,
  currentArtist: () => artistStore.currentArtist,
  onlineArtists: () => onlineStore.onlineArtists,
});

const { coverUrl } = useCoverLoader({
  currentMusic: () => props.currentMusic,
  currentOnlineSong: () => props.currentOnlineSong,
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
});

const playModeIcon = computed(() => {
  switch (props.playMode) {
    case PlayMode.REPEAT_ONE:
      return RefreshRight;
    case PlayMode.RANDOM:
      return Refresh;
    default:
      return Sort;
  }
});

const playModeTooltip = computed(() => {
  switch (props.playMode) {
    case PlayMode.REPEAT_ONE:
      return t("playerBar.repeatOne");
    case PlayMode.RANDOM:
      return t("playerBar.random");
    default:
      return t("playerBar.sequential");
  }
});

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

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const currentTimeDisplay = computed(() => formatTime(props.currentPlayTime));
const durationDisplay = computed(() => formatTime(props.currentTrackDuration));

const progressPercent = computed(() => {
  if (!props.currentTrackDuration || props.currentTrackDuration <= 0) return 0;
  return (props.currentPlayTime / props.currentTrackDuration) * 100;
});

function handleProgressChange(value: number) {
  const newPosition = Math.floor((value / 100) * props.currentTrackDuration);
  emit("seek", newPosition);
}

watch(progressPercent, (newVal) => {
  if (!isDragging.value) {
    sliderValue.value = newVal;
  }
});
</script>

<template>
  <div class="player-bar">
    <!-- 左侧：封面 + 歌曲信息 -->
    <div class="player-left">
      <div class="cover-container" @click="enterImmersiveMode">
        <CoverImage
          :src="coverUrl"
          alt="Album Cover"
          :clickable="Boolean(currentOnlineSong || currentMusic)"
          :size="44"
          :radius="6"
        />
      </div>
      <div class="song-info">
        <div class="song-name" :title="songTitle">{{ songTitle }}</div>
        <div
          v-if="currentArtistDisplay"
          class="artist-name"
          :title="currentArtistDisplay"
        >
          <template v-if="artistNames.length">
            <template v-for="(a, idx) in artistNames" :key="a + idx">
              <span
                class="artist-part"
                :class="{ 'artist-link': canNavigateArtist }"
                @click.stop="navigateArtistByName(a)"
                :title="`${a}（点击查看）`"
              >
                {{ a }}
              </span>
              <span v-if="idx < artistNames.length - 1" class="artist-sep">, </span>
            </template>
          </template>
          <template v-else>
            {{ currentArtistDisplay }}
          </template>
        </div>
      </div>
    </div>

    <!-- 中间：播放控制 + 进度条 -->
    <div class="player-center">
      <div class="player-controls">
        <el-tooltip
          :content="t('playerBar.previous')"
          placement="top"
          effect="light"
          :disabled="!currentMusic && !currentOnlineSong"
        >
          <el-button
            class="control-btn"
            :icon="ArrowLeft"
            :disabled="!currentMusic && !currentOnlineSong"
            @click="emit('previous')"
          />
        </el-tooltip>

        <el-tooltip
          :content="isPlaying ? t('playerBar.pause') : t('playerBar.play')"
          placement="top"
          effect="light"
          :disabled="!currentMusic && !currentOnlineSong"
        >
          <el-button
            class="control-btn play-btn"
            :icon="isPlaying ? VideoPause : VideoPlay"
            :disabled="!currentMusic && !currentOnlineSong"
            @click="emit('toggle-play')"
          />
        </el-tooltip>

        <el-tooltip
          :content="t('playerBar.next')"
          placement="top"
          effect="light"
          :disabled="!currentMusic && !currentOnlineSong"
        >
          <el-button
            class="control-btn"
            :icon="ArrowRight"
            :disabled="!currentMusic && !currentOnlineSong"
            @click="emit('next')"
          />
        </el-tooltip>
      </div>

      <div class="player-progress">
        <span class="time-display">{{ currentTimeDisplay }}</span>
        <el-slider
          v-model="sliderValue"
          :max="100"
          :min="0"
          :step="0.1"
          :show-tooltip="false"
          :disabled="!currentMusic && !currentOnlineSong"
          class="progress-slider"
          @focus="isDragging = true"
          @blur="isDragging = false"
          @change="handleProgressChange"
        />
        <span class="time-display">{{ durationDisplay }}</span>
      </div>
    </div>

    <!-- 右侧：播放模式 + 内联音量条 -->
    <div class="player-right">
      <el-tooltip :content="playModeTooltip" placement="top" effect="light">
        <el-button
          class="play-mode-btn"
          :class="{ 'is-active': true }"
          circle
          :icon="playModeIcon"
          @click="emit('toggle-play-mode')"
        />
      </el-tooltip>
      <div class="volume-bar">
        <span class="volume-speaker-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        </span>
        <el-slider
          v-model="volume"
          :max="100"
          :min="0"
          :step="1"
          :show-tooltip="false"
          class="volume-slider volume-slider-h"
        />
      </div>
    </div>
  </div>
</template>

<style scoped src="./PlayerBar.css" />

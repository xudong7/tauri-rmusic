<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Sort,
  Refresh,
  RefreshRight,
  Tickets,
} from "@element-plus/icons-vue";
import {
  PlayMode,
  type MusicFile,
  type PlaybackPhase,
  type SongInfo,
} from "@/types/model";
import { formatDuration, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";
import { useArtistStore } from "@/stores/artistStore";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";

const { t, locale } = useI18n();

const props = withDefaults(
  defineProps<{
    currentMusic: MusicFile | null;
    currentOnlineSong: SongInfo | null;
    isPlaying: boolean;
    playbackPhase?: PlaybackPhase;
    playMode: PlayMode;
    volume: number;
    currentPlayTime: number;
    currentTrackDuration: number;
  }>(),
  {
    playbackPhase: "idle",
  }
);

const emit = defineEmits([
  "toggle-play",
  "volume-change",
  "next",
  "previous",
  "toggle-play-mode",
  "toggle-queue",
  "show-immersive",
  "seek",
]);

const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();
const volumeSliderValue = ref(props.volume);
const lastAudibleVolume = ref(props.volume > 0 ? props.volume : 50);
const showRemainingTime = ref(false);

watch(
  () => props.volume,
  (value) => {
    if (value !== volumeSliderValue.value) volumeSliderValue.value = value;
    if (value > 0) lastAudibleVolume.value = value;
  }
);

function handleVolumeChange(value: number | number[]) {
  const nextValue = Array.isArray(value) ? (value[0] ?? 0) : value;
  volumeSliderValue.value = nextValue;
  emit("volume-change", nextValue);
}

function toggleMute() {
  handleVolumeChange(props.volume > 0 ? 0 : lastAudibleVolume.value);
}

const currentSongName = computed(() => {
  void locale.value;
  if (props.currentOnlineSong) return props.currentOnlineSong.name;
  return props.currentMusic
    ? getLocalMusicDisplayInfo(props.currentMusic).title
    : t("playerBar.noSong");
});

const songTitle = computed(() => currentSongName.value);
const hasTrack = computed(() => Boolean(props.currentMusic || props.currentOnlineSong));
const isLoading = computed(() => props.playbackPhase !== "idle");
const playbackStatus = computed(() =>
  props.playbackPhase === "resolving"
    ? t("playerBar.resolving")
    : t("playerBar.buffering")
);
const remainingTimeDisplay = computed(
  () =>
    `-${formatDuration(Math.max(0, props.currentTrackDuration - props.currentPlayTime))}`
);

const currentArtistDisplay = computed(() => {
  void locale.value;
  if (props.currentOnlineSong?.artists?.length)
    return props.currentOnlineSong.artists.join(", ");
  if (props.currentMusic) {
    return getLocalMusicDisplayInfo(props.currentMusic, t("common.unknownArtist")).artist;
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

// 进入沉浸模式
function enterImmersiveMode() {
  // 只要有当前歌曲（在线或本地）就可以进入沉浸模式
  if (props.currentOnlineSong || props.currentMusic) {
    emit("show-immersive");
  }
}

const {
  sliderValue,
  progressDisabled,
  currentTimeDisplay,
  durationDisplay,
  handleProgressInput,
  handleProgressChange,
} = usePlaybackProgressSlider({
  currentTime: () => props.currentPlayTime,
  duration: () => props.currentTrackDuration,
  hasTrack: () => Boolean(props.currentMusic || props.currentOnlineSong),
  onSeek: (positionMs) => emit("seek", positionMs),
});
</script>

<template>
  <div class="player-bar" :class="{ 'is-empty': !hasTrack }">
    <!-- 左侧：封面 + 歌曲信息 -->
    <div class="player-left">
      <div class="cover-container" @click="enterImmersiveMode">
        <CoverImage
          :src="coverUrl"
          alt="Album Cover"
          :clickable="Boolean(currentOnlineSong || currentMusic)"
          :size="48"
          :radius="8"
        />
      </div>
      <div class="song-info">
        <div class="song-name" :title="songTitle">{{ songTitle }}</div>
        <div v-if="isLoading" class="playback-status" role="status">
          {{ playbackStatus }}
        </div>
        <div
          v-else-if="currentArtistDisplay"
          class="artist-name"
          :title="currentArtistDisplay"
        >
          <template v-if="artistNames.length">
            <template v-for="(a, idx) in artistNames" :key="a + idx">
              <component
                :is="canNavigateArtist ? 'button' : 'span'"
                :type="canNavigateArtist ? 'button' : undefined"
                class="artist-part"
                :class="{ 'artist-link': canNavigateArtist }"
                @click.stop="navigateArtistByName(a)"
                :title="canNavigateArtist ? t('artist.open', { name: a }) : a"
              >
                {{ a }}
              </component>
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
      <div v-show="hasTrack" class="player-controls">
        <el-tooltip
          :content="t('playerBar.previous')"
          placement="top"
          effect="light"
          :disabled="!currentMusic && !currentOnlineSong"
        >
          <el-button
            class="control-btn app-icon-button"
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
            class="control-btn play-btn app-play-button"
            :icon="isPlaying ? VideoPause : VideoPlay"
            :loading="isLoading"
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
            class="control-btn app-icon-button"
            :icon="ArrowRight"
            :disabled="!currentMusic && !currentOnlineSong"
            @click="emit('next')"
          />
        </el-tooltip>
      </div>

      <div v-show="hasTrack" class="player-progress">
        <span class="time-display">{{ currentTimeDisplay }}</span>
        <el-slider
          v-model="sliderValue"
          :max="100"
          :min="0"
          :step="0.1"
          :show-tooltip="false"
          :disabled="progressDisabled"
          class="progress-slider"
          @input="handleProgressInput"
          @change="handleProgressChange"
        />
        <button
          type="button"
          class="time-display time-display-toggle"
          :aria-label="t('playerBar.toggleRemainingTime')"
          @click="showRemainingTime = !showRemainingTime"
        >
          {{ showRemainingTime ? remainingTimeDisplay : durationDisplay }}
        </button>
      </div>
      <div v-if="!hasTrack" class="player-empty-hint">
        {{ t("playerBar.emptyHint") }}
      </div>
    </div>

    <!-- 右侧：播放模式 + 内联音量条 -->
    <div v-show="hasTrack" class="player-right">
      <div class="player-tool-group">
        <el-tooltip :content="t('playerBar.queue')" placement="top" effect="light">
          <el-button
            class="queue-btn app-icon-button"
            circle
            :icon="Tickets"
            :disabled="!currentMusic && !currentOnlineSong"
            :aria-label="t('playerBar.queue')"
            @click="emit('toggle-queue')"
          />
        </el-tooltip>
        <el-tooltip :content="playModeTooltip" placement="top" effect="light">
          <el-button
            class="play-mode-btn app-icon-button"
            :class="{ 'is-active': playMode !== PlayMode.SEQUENTIAL }"
            circle
            :icon="playModeIcon"
            @click="emit('toggle-play-mode')"
          />
        </el-tooltip>
      </div>
      <div class="volume-bar">
        <button
          type="button"
          class="volume-speaker-icon"
          :aria-label="t(volume > 0 ? 'playerBar.mute' : 'playerBar.unmute')"
          @click="toggleMute"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
            />
          </svg>
        </button>
        <el-slider
          v-model="volumeSliderValue"
          :max="100"
          :min="0"
          :step="1"
          :show-tooltip="false"
          class="volume-slider volume-slider-h"
          @change="handleVolumeChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped src="./PlayerBar.css" />

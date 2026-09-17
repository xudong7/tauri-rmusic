<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import PauseIcon from "@/components/base/icons/PauseIcon.vue";
import {
  PlayMode,
  type MusicFile,
  type PlaybackPhase,
  type SongInfo,
} from "@/types/model";
import { formatDuration, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { playModeIcon, playModeLabelKey } from "@/utils/playModeUtils";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";
import { useVolumeMute } from "@/composables/usePlaybackVolume";
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
const showRemainingTime = ref(false);

watch(
  () => props.volume,
  (value) => {
    if (value !== volumeSliderValue.value) volumeSliderValue.value = value;
  }
);

function handleVolumeChange(value: number | number[]) {
  const nextValue = Array.isArray(value) ? (value[0] ?? 0) : value;
  volumeSliderValue.value = nextValue;
  emit("volume-change", nextValue);
}

const { toggleMute } = useVolumeMute({
  currentVolume: () => props.volume,
  onChange: handleVolumeChange,
});

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

const currentPlayModeIcon = computed(() => playModeIcon(props.playMode));
const playModeTooltip = computed(() => t(playModeLabelKey(props.playMode)));

function enterImmersiveMode() {
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
          :alt="t('playerBar.albumCover')"
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
        <!-- 播放顺序：本质是播放行为的开关，和上一首/下一首同族，
             原先挤在右侧工具组里，挪到控制行左侧。
             它与右侧音量键各占 32px，左右对称，播放键才落在控制行正中。 -->
        <el-tooltip :content="playModeTooltip" placement="top" effect="light">
          <el-button
            class="control-btn play-mode-btn app-icon-button"
            :class="{ 'is-active': playMode !== PlayMode.SEQUENTIAL }"
            :icon="currentPlayModeIcon"
            :aria-label="playModeTooltip"
            @click="emit('toggle-play-mode')"
          />
        </el-tooltip>

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
            :aria-label="t('playerBar.previous')"
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
            :icon="isPlaying ? PauseIcon : PlayIcon"
            :loading="isLoading"
            :disabled="!currentMusic && !currentOnlineSong"
            :aria-label="isPlaying ? t('playerBar.pause') : t('playerBar.play')"
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
            :aria-label="t('playerBar.next')"
            @click="emit('next')"
          />
        </el-tooltip>

        <!-- 音量：图标常驻，滑块悬停或聚焦时从图标上方浮出。
             参考图里音量只有一个图标，因为常驻滑块会占掉一百多像素，
             把播放键挤出控制行中心。浮层不占布局，两侧才保持对称。 -->
        <div class="volume-control">
          <button
            type="button"
            class="control-btn volume-speaker-icon"
            :aria-label="t(volume > 0 ? 'playerBar.mute' : 'playerBar.unmute')"
            @click="toggleMute"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
              />
            </svg>
          </button>
          <div class="volume-popup">
            <div class="volume-popup-inner">
              <el-slider
                v-model="volumeSliderValue"
                :max="100"
                :min="0"
                :step="1"
                :show-tooltip="false"
                :aria-label="t('playerBar.volume')"
                class="volume-slider volume-slider-h"
                @change="handleVolumeChange"
              />
            </div>
          </div>
        </div>
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

    <!-- 右侧：只剩播放队列。播放顺序与音量已归入控制行。 -->
    <div v-show="hasTrack" class="player-right">
      <el-tooltip :content="t('playerBar.queue')" placement="top" effect="light">
        <el-button
          class="queue-btn app-icon-button"
          circle
          :disabled="!currentMusic && !currentOnlineSong"
          :aria-label="t('playerBar.queue')"
          @click="emit('toggle-queue')"
        >
          <!-- 播放列表图标：上面两条通栏横线，第三条短一截，右下角补一个播放三角。
              照参考图临摹，Element Plus 里没有对应图标，所以自己画。
              尺寸在 CSS 里控制（.queue-icon），不跟 el-icon 的 font-size 走。 -->
          <svg class="queue-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 4h18M3 11h18M3 18h9"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path d="M15 14.2 21 18l-6 3.8Z" fill="currentColor" />
          </svg>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped src="./PlayerBar.css" />

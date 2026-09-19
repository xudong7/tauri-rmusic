<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Headset,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Close,
} from "@element-plus/icons-vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import PauseIcon from "@/components/base/icons/PauseIcon.vue";
import { PlayMode, type SongInfo, type MusicFile } from "@/types/model";
import { playModeIcon, playModeLabelKey } from "@/utils/playModeUtils";
import LyricView from "@/components/feature/LyricView/LyricView.vue";
import { useCoverPalette } from "@/composables/useCoverPalette";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";
import { useVolumeMute } from "@/composables/usePlaybackVolume";
import { usePlatform } from "@/composables/usePlatform";
import { useWindowDrag } from "@/composables/useWindowDrag";
import {
  ARTIST_SEPARATOR,
  extractArtistName,
  extractSongTitle,
  formatArtists,
  getLocalMusicDisplayInfo,
} from "@/utils/songUtils";
import { useWindowControls } from "@/composables/useWindowControls";
import { useArtistStore } from "@/stores/artistStore";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";

const { t, locale } = useI18n();

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  currentTime?: number;
  currentTrackDuration?: number;
  playMode?: PlayMode;
  volume: number;
}>();

const emit = defineEmits<{
  "toggle-play": [];
  previous: [];
  next: [];
  exit: [];
  seek: [positionMs: number];
  "toggle-play-mode": [];
  "volume-change": [value: number];
}>();

const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();
const { isMacPlatform } = usePlatform();

const {
  sliderValue,
  progressDisabled,
  currentTimeDisplay,
  durationDisplay,
  handleProgressInput,
  handleProgressChange,
} = usePlaybackProgressSlider({
  currentTime: () => props.currentTime ?? 0,
  duration: () => props.currentTrackDuration ?? 0,
  hasTrack: () => Boolean(props.currentSong || props.currentMusic),
  onSeek: (positionMs) => emit("seek", positionMs),
});

const currentPlayModeIcon = computed(() => playModeIcon(props.playMode));
const playModeTooltip = computed(() => t(playModeLabelKey(props.playMode)));

const volumeSliderValue = ref(props.volume);

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

const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const { startWindowDrag } = useWindowDrag();
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));

const { coverUrl: currentCoverUrl } = useCoverLoader({
  currentMusic: () => props.currentMusic,
  currentOnlineSong: () => props.currentSong,
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
});
const { brightness: imageAnalysisState } = useCoverPalette(currentCoverUrl);

const songTitle = computed(() => {
  void locale.value;
  if (props.currentSong) return extractSongTitle(props.currentSong.name);
  if (props.currentMusic) return getLocalMusicDisplayInfo(props.currentMusic).title;
  return t("common.unknownSong");
});

const currentArtistName = computed(() => {
  if (props.currentSong?.artists?.length) return formatArtists(props.currentSong.artists);
  if (props.currentSong) return extractArtistName(props.currentSong.name);
  if (props.currentMusic) return getLocalMusicDisplayInfo(props.currentMusic).artist;
  return "";
});

const { artistNames, canNavigateArtist, navigateArtistByName } = useArtistNavigation({
  currentOnlineSong: () => props.currentSong,
  localArtistDisplay: () => currentArtistName.value,
  currentArtist: () => artistStore.currentArtist,
  onlineArtists: () => onlineStore.onlineArtists,
});

const backgroundFilterStyle = computed(() => {
  return `blur(46px) saturate(1.36) contrast(1.04) brightness(${imageAnalysisState.value.brightness})`;
});

const usesDarkForeground = computed(
  () => imageAnalysisState.value.isAnalyzed && imageAnalysisState.value.brightness <= 0.98
);

// 覆盖层透明度样式 - 使用更优雅的渐变，保留更多专辑封面细节
const overlayStyle = computed(() => {
  if (usesDarkForeground.value) {
    return {
      background: `linear-gradient(
        135deg,
        rgba(248, 250, 252, 0.18) 0%,
        rgba(239, 243, 246, 0.24) 58%,
        rgba(248, 250, 252, 0.16) 100%
      )`,
    };
  }

  const brightness = imageAnalysisState.value.brightness;
  let gradientOpacity: string;
  let solidOpacity: number;

  if (brightness >= 1.08) {
    gradientOpacity = "0.18";
    solidOpacity = 0.26;
  } else if (brightness >= 0.98) {
    gradientOpacity = "0.17";
    solidOpacity = 0.25;
  } else {
    gradientOpacity = "0.16";
    solidOpacity = 0.24;
  }
  return {
    background: `linear-gradient(
      135deg,
      rgba(0, 0, 0, ${gradientOpacity}) 0%,
      rgba(0, 0, 0, ${solidOpacity}) 58%,
      rgba(0, 0, 0, ${Number(gradientOpacity) + 0.08}) 100%
    )`,
  };
});
</script>

<template>
  <div
    class="immersive-view"
    :class="{
      'is-mac-platform': isMacPlatform,
      'uses-dark-foreground': usesDarkForeground,
    }"
  >
    <img
      v-if="currentCoverUrl"
      :key="currentCoverUrl"
      :src="currentCoverUrl"
      class="background-cover"
      :style="{ filter: backgroundFilterStyle }"
      alt=""
      aria-hidden="true"
    />
    <div class="overlay" :style="overlayStyle"></div>
    <div
      class="immersive-titlebar-drag-region"
      aria-hidden="true"
      @mousedown="startWindowDrag"
    ></div>

    <div class="top-section">
      <!-- 只有图标没有文本，必须显式补 aria-label，否则读屏只念得出一个「按钮」。
           悬浮文字 tip 一律不要，视觉上保持干净。 -->
      <el-button
        data-no-drag
        @click="emit('exit')"
        :icon="ArrowDown"
        :aria-label="t('common.back')"
        circle
        class="back-btn"
      />

      <!-- 非 macOS 平台显示窗口控制按钮 -->
      <div v-if="!isMacPlatform" class="window-controls">
        <el-button
          @click="minimize"
          :icon="Minus"
          circle
          :aria-label="t('header.minimize')"
        />
        <el-button
          @click="toggleMaximize"
          :icon="maximizeIcon"
          circle
          :aria-label="isMaximized ? t('header.restore') : t('header.maximize')"
        />
        <el-button @click="close" :icon="Close" circle :aria-label="t('header.close')" />
      </div>
    </div>

    <div class="content-section">
      <!-- 左侧：封面 + 歌曲信息 -->
      <div class="left-section">
        <div class="cover-container">
          <img
            v-if="currentCoverUrl"
            :key="currentCoverUrl"
            :src="currentCoverUrl"
            class="song-cover"
            :alt="t('playerBar.albumCover')"
          />
          <div v-else class="no-cover">
            <el-icon><Headset /></el-icon>
          </div>
        </div>

        <div class="song-info">
          <h1 class="song-title" :title="songTitle">{{ songTitle }}</h1>
          <div class="song-artist-container">
            <div
              class="song-artist"
              :title="currentArtistName || t('common.unknownArtist')"
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
                  <span v-if="idx < artistNames.length - 1" class="artist-sep">{{
                    ARTIST_SEPARATOR
                  }}</span>
                </template>
              </template>
              <template v-else>
                {{ currentArtistName || t("common.unknownArtist") }}
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：歌词 -->
      <div class="right-section">
        <div class="lyric-view-container">
          <LyricView
            :currentSong="currentSong"
            :currentMusic="currentMusic"
            :isPlaying="isPlaying"
            :currentTime="currentTime"
          />
        </div>
      </div>
    </div>

    <!-- 底部播放栏：像播放栏一样承载控制与进度，默认隐藏，
         鼠标移到底部热区（或键盘聚焦其中）才滑出。 -->
    <div class="immersive-bottom-zone">
      <div class="immersive-bottom-bar">
        <div class="controls">
          <el-button
            circle
            class="immersive-control-btn immersive-mode-btn"
            :class="{ 'is-active': playMode !== PlayMode.SEQUENTIAL }"
            :icon="currentPlayModeIcon"
            :aria-label="playModeTooltip"
            @click="emit('toggle-play-mode')"
          />
          <el-button
            circle
            class="immersive-control-btn"
            :icon="ArrowLeft"
            :aria-label="t('playerBar.previous')"
            @click="emit('previous')"
          />
          <el-button
            circle
            size="large"
            class="immersive-play-btn"
            :icon="isPlaying ? PauseIcon : PlayIcon"
            :aria-label="isPlaying ? t('playerBar.pause') : t('playerBar.play')"
            @click="emit('toggle-play')"
            type="primary"
          />
          <el-button
            circle
            class="immersive-control-btn"
            :icon="ArrowRight"
            :aria-label="t('playerBar.next')"
            @click="emit('next')"
          />

          <!-- 音量：图标常驻，滑块悬停/聚焦时从上方浮出，与播放栏同一交互 -->
          <div class="immersive-volume">
            <button
              type="button"
              class="immersive-volume-btn"
              :aria-label="t(volume > 0 ? 'playerBar.mute' : 'playerBar.unmute')"
              @click="toggleMute"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                />
              </svg>
            </button>
            <div class="immersive-volume-popup">
              <div class="immersive-volume-popup-inner">
                <el-slider
                  v-model="volumeSliderValue"
                  :max="100"
                  :min="0"
                  :step="1"
                  :show-tooltip="false"
                  :aria-label="t('playerBar.volume')"
                  class="immersive-volume-slider"
                  @change="handleVolumeChange"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="immersive-progress">
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
          <span class="time-display">{{ durationDisplay }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ImmersiveView.css" />

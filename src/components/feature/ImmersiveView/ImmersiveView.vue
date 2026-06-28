<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  VideoPlay,
  VideoPause,
  ArrowLeft,
  ArrowRight,
  Headset,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Close,
} from "@element-plus/icons-vue";
import type { SongInfo, MusicFile, PlayMode } from "@/types/model";
import LyricView from "@/components/feature/LyricView/LyricView.vue";
import { useCoverBrightness } from "@/composables/useCoverBrightness";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { usePlaybackProgressSlider } from "@/composables/usePlaybackProgressSlider";
import { usePlatform } from "@/composables/usePlatform";
import { useWindowDrag } from "@/composables/useWindowDrag";
import {
  getDisplayName,
  extractArtistName,
  extractSongTitle,
  formatArtists,
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
}>();

const emit = defineEmits<{
  "toggle-play": [];
  previous: [];
  next: [];
  exit: [];
  seek: [positionMs: number];
  "volume-change": [volume: number];
  "toggle-play-mode": [];
}>();

const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();
const { isMacPlatform } = usePlatform();

const volume = ref(50);

watch(volume, () => {
  emit("volume-change", volume.value);
});

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
const { brightness: imageAnalysisState } = useCoverBrightness(currentCoverUrl);

// 当前歌曲标题
const songTitle = computed(() => {
  void locale.value;
  if (props.currentSong) return extractSongTitle(props.currentSong.name);
  if (props.currentMusic)
    return extractSongTitle(getDisplayName(props.currentMusic.file_name));
  return t("common.unknownSong");
});

const currentArtistName = computed(() => {
  if (props.currentSong?.artists?.length) return formatArtists(props.currentSong.artists);
  if (props.currentSong) return extractArtistName(props.currentSong.name);
  if (props.currentMusic)
    return extractArtistName(getDisplayName(props.currentMusic.file_name));
  return "";
});

const { artistNames, canNavigateArtist, navigateArtistByName } = useArtistNavigation({
  currentOnlineSong: () => props.currentSong,
  localArtistDisplay: () => currentArtistName.value,
  currentArtist: () => artistStore.currentArtist,
  onlineArtists: () => onlineStore.onlineArtists,
});

// 用于背景的模糊封面样式
const backgroundStyle = computed(() => {
  if (currentCoverUrl.value) {
    return {
      backgroundImage: `url(${currentCoverUrl.value})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return {};
});

// 背景滤镜样式
const backgroundFilterStyle = computed(() => {
  return `blur(42px) saturate(1.18) brightness(${imageAnalysisState.value.brightness})`;
});

// 覆盖层透明度样式 - 使用更优雅的渐变，保留更多专辑封面细节
const overlayStyle = computed(() => {
  const brightness = imageAnalysisState.value.brightness;
  let gradientOpacity: string;
  let solidOpacity: number;

  if (brightness >= 1.08) {
    gradientOpacity = "0.32";
    solidOpacity = 0.46;
  } else if (brightness >= 0.98) {
    gradientOpacity = "0.28";
    solidOpacity = 0.4;
  } else {
    gradientOpacity = "0.22";
    solidOpacity = 0.34;
  }
  return {
    background: `linear-gradient(
      135deg,
      rgba(0, 0, 0, ${gradientOpacity}) 0%,
      rgba(0, 0, 0, ${solidOpacity}) 58%,
      rgba(0, 0, 0, ${Number(gradientOpacity) + 0.12}) 100%
    )`,
  };
});
</script>

<template>
  <div class="immersive-view" :class="{ 'is-mac-platform': isMacPlatform }">
    <div
      v-if="currentCoverUrl"
      class="background-cover"
      :style="[backgroundStyle, { filter: backgroundFilterStyle }]"
    ></div>
    <div class="overlay" :style="overlayStyle"></div>
    <div
      class="immersive-titlebar-drag-region"
      aria-hidden="true"
      @mousedown="startWindowDrag"
    ></div>

    <div class="top-section">
      <el-tooltip :content="t('common.close')" placement="bottom" effect="dark">
        <el-button
          data-no-drag
          @click="emit('exit')"
          :icon="ScaleToOriginal"
          circle
          class="back-btn"
        />
      </el-tooltip>

      <!-- 非 macOS 平台显示窗口控制按钮 -->
      <div v-if="!isMacPlatform" class="window-controls">
        <el-tooltip :content="t('header.minimize')" placement="bottom" effect="dark">
          <el-button @click="minimize" :icon="Minus" circle />
        </el-tooltip>
        <el-tooltip
          :content="isMaximized ? t('header.restore') : t('header.maximize')"
          placement="bottom"
          effect="dark"
        >
          <el-button @click="toggleMaximize" :icon="maximizeIcon" circle />
        </el-tooltip>
        <el-tooltip :content="t('header.close')" placement="bottom" effect="dark">
          <el-button @click="close" :icon="Close" circle />
        </el-tooltip>
      </div>
    </div>

    <div class="content-section">
      <!-- 左侧：封面 + 歌曲信息 + 控制 -->
      <div class="left-section">
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
          <h1 class="song-title" :title="songTitle">{{ songTitle }}</h1>
          <div class="song-artist-container">
            <div
              class="song-artist"
              :title="currentArtistName || t('common.unknownArtist')"
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
                {{ currentArtistName || t("common.unknownArtist") }}
              </template>
            </div>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="controls">
          <el-button circle :icon="ArrowLeft" @click="emit('previous')" />
          <el-button
            circle
            size="large"
            :icon="isPlaying ? VideoPause : VideoPlay"
            @click="emit('toggle-play')"
            type="primary"
          />
          <el-button circle :icon="ArrowRight" @click="emit('next')" />
        </div>

        <!-- 进度条 -->
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
  </div>
</template>

<style scoped src="./ImmersiveView.css" />

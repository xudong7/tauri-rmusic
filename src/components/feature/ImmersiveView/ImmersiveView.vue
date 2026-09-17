<script setup lang="ts">
import { computed } from "vue";
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
import type { SongInfo, MusicFile, PlayMode } from "@/types/model";
import LyricView from "@/components/feature/LyricView/LyricView.vue";
import PlaybackProgress from "@/components/feature/PlayerBar/PlaybackProgress.vue";
import { useCoverPalette } from "@/composables/useCoverPalette";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
import { usePlatform } from "@/composables/usePlatform";
import { useWindowDrag } from "@/composables/useWindowDrag";
import {
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
  playMode?: PlayMode;
}>();

const emit = defineEmits<{
  "toggle-play": [];
  previous: [];
  next: [];
  exit: [];
  seek: [positionMs: number];
  "toggle-play-mode": [];
}>();

const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();
const { isMacPlatform } = usePlatform();

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

// 当前歌曲标题
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

// 背景滤镜样式
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
      <el-tooltip :content="t('common.back')" placement="bottom" effect="dark">
        <!-- 只有图标没有文本，el-tooltip 给的 aria-describedby 是「描述」不是
             「名称」，所以要显式补 aria-label，否则读屏只念得出一个「按钮」。 -->
        <el-button
          data-no-drag
          @click="emit('exit')"
          :icon="ArrowDown"
          :aria-label="t('common.back')"
          circle
          class="back-btn"
        />
      </el-tooltip>

      <!-- 非 macOS 平台显示窗口控制按钮 -->
      <div v-if="!isMacPlatform" class="window-controls">
        <el-tooltip :content="t('header.minimize')" placement="bottom" effect="dark">
          <el-button
            @click="minimize"
            :icon="Minus"
            circle
            :aria-label="t('header.minimize')"
          />
        </el-tooltip>
        <el-tooltip
          :content="isMaximized ? t('header.restore') : t('header.maximize')"
          placement="bottom"
          effect="dark"
        >
          <el-button
            @click="toggleMaximize"
            :icon="maximizeIcon"
            circle
            :aria-label="isMaximized ? t('header.restore') : t('header.maximize')"
          />
        </el-tooltip>
        <el-tooltip :content="t('header.close')" placement="bottom" effect="dark">
          <el-button
            @click="close"
            :icon="Close"
            circle
            :aria-label="t('header.close')"
          />
        </el-tooltip>
      </div>
    </div>

    <div class="content-section">
      <!-- 左侧：封面 + 歌曲信息 + 控制 -->
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
          <el-button
            circle
            class="immersive-control-btn"
            :icon="ArrowLeft"
            @click="emit('previous')"
          />
          <el-button
            circle
            size="large"
            class="immersive-play-btn"
            :icon="isPlaying ? PauseIcon : PlayIcon"
            @click="emit('toggle-play')"
            type="primary"
          />
          <el-button
            circle
            class="immersive-control-btn"
            :icon="ArrowRight"
            @click="emit('next')"
          />
        </div>

        <!-- 进度条：叶子组件直接读 playerStore，避免 4Hz 时间更新
             触发整个沉浸页重渲染 -->
        <PlaybackProgress variant="immersive" @seek="emit('seek', $event)" />
      </div>

      <!-- 右侧：歌词 -->
      <div class="right-section">
        <div class="lyric-view-container">
          <LyricView
            :currentSong="currentSong"
            :currentMusic="currentMusic"
            :isPlaying="isPlaying"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ImmersiveView.css" />

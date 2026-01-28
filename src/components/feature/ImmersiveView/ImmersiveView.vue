<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  VideoPlay,
  VideoPause,
  Back,
  ArrowLeft,
  ArrowRight,
  Headset,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Close,
} from "@element-plus/icons-vue";
import type { SongInfo, MusicFile } from "@/types/model";
import LyricView from "@/components/feature/LyricView/LyricView.vue";
import { useCoverLoader } from "@/composables/useCoverLoader";
import { useArtistNavigation } from "@/composables/useArtistNavigation";
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
}>();

const emit = defineEmits(["toggle-play", "previous", "next", "exit"]);

const artistStore = useArtistStore();
const onlineStore = useOnlineMusicStore();
const localStore = useLocalMusicStore();
const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));

const { coverUrl: currentCoverUrl } = useCoverLoader({
  currentMusic: () => props.currentMusic,
  currentOnlineSong: () => props.currentSong,
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
});

// 图片亮度分析状态
const imageAnalysisState = ref({
  brightness: 0.7, // 默认亮度
  isAnalyzing: false,
  isAnalyzed: false,
});

// 分析图片亮度
async function analyzeCoverBrightness(imageUrl: string) {
  if (!imageUrl || imageAnalysisState.value.isAnalyzing) return;

  imageAnalysisState.value.isAnalyzing = true;

  try {
    // 创建一个隐藏的图片元素来加载图片
    const img = new Image();
    img.crossOrigin = "Anonymous";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    // 使用 canvas 分析图片亮度
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 计算平均亮度 (0-255)
    let totalBrightness = 0;
    let count = 0;

    // 每隔几个像素采样一次，提高性能
    const sampleStep = Math.max(1, Math.floor(data.length / 4 / 1000));

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 加权亮度计算 (人眼对绿色最敏感)
      const pixelBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += pixelBrightness;
      count++;
    }

    // 计算平均亮度并归一化到 0-1 范围
    const averageBrightness = totalBrightness / count / 255;

    // 根据图片亮度计算合适的背景亮度值
    // 亮图片需要降低背景亮度，暗图片需要提高背景亮度
    let adjustedBrightness;

    if (averageBrightness < 0.3) {
      // 暗图片，稍微提高亮度
      adjustedBrightness = 0.9;
    } else if (averageBrightness < 0.6) {
      // 中等亮度，适中调整
      adjustedBrightness = 0.7;
    } else {
      // 亮图片，降低亮度
      adjustedBrightness = 0.5;
    }

    imageAnalysisState.value.brightness = adjustedBrightness;
    imageAnalysisState.value.isAnalyzed = true;
  } catch (error) {
    console.error("分析封面图片亮度失败:", error);
    // 使用默认值
    imageAnalysisState.value.brightness = 0.7;
  } finally {
    imageAnalysisState.value.isAnalyzing = false;
  }
}

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
  return `blur(30px) brightness(${imageAnalysisState.value.brightness})`;
});

// 覆盖层透明度样式
const overlayStyle = computed(() => {
  // 根据图片亮度调整覆盖层透明度
  // 亮图片需要更暗的覆盖层，暗图片需要更透明的覆盖层
  let opacity;

  if (imageAnalysisState.value.brightness > 0.8) {
    // 如果背景很亮，覆盖层应该更暗
    opacity = 0.8;
  } else if (imageAnalysisState.value.brightness > 0.6) {
    // 中等亮度
    opacity = 0.7;
  } else {
    // 背景较暗，覆盖层应该更透明
    opacity = 0.6;
  }
  return {
    background: `rgba(0, 0, 0, ${opacity * 0.8})`,
  };
});

// 监听封面URL变化，重新分析亮度
watch(
  () => currentCoverUrl.value,
  (newUrl) => {
    if (newUrl) {
      imageAnalysisState.value.isAnalyzed = false;
      analyzeCoverBrightness(newUrl);
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="immersive-view">
    <div
      v-if="currentCoverUrl"
      class="background-cover"
      :style="[backgroundStyle, { filter: backgroundFilterStyle }]"
    ></div>
    <div class="overlay" :style="overlayStyle"></div>

    <div class="top-section">
      <el-tooltip :content="t('common.back')" placement="bottom" effect="dark">
        <el-button @click="emit('exit')" :icon="Back" circle class="back-btn" />
      </el-tooltip>

      <div class="window-controls">
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
      </div>

      <div class="right-section">
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
    <div class="control-section">
      <div class="controls">
        <el-tooltip :content="t('playerBar.previous')" placement="top" effect="dark">
          <el-button circle :icon="ArrowLeft" @click="emit('previous')" />
        </el-tooltip>

        <el-tooltip
          :content="isPlaying ? t('playerBar.pause') : t('playerBar.play')"
          placement="top"
          effect="dark"
        >
          <el-button
            circle
            size="large"
            :icon="isPlaying ? VideoPause : VideoPlay"
            @click="emit('toggle-play')"
            type="primary"
          />
        </el-tooltip>

        <el-tooltip :content="t('playerBar.next')" placement="top" effect="dark">
          <el-button circle :icon="ArrowRight" @click="emit('next')" />
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ImmersiveView.css" />

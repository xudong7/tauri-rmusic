<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
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
import type { SongInfo, MusicFile } from "../../types/model";
import LyricView from "../LyricView/LyricView.vue";
import { useMusicStore } from "@/stores/musicStore";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const props = defineProps<{
  currentSong: SongInfo | null;
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  currentTime?: number; // 从父组件传入的当前播放时间
  hasStartedPlaying?: boolean; // 是否已经开始播放，用于歌词滚动
}>();

const emit = defineEmits(["toggle-play", "previous", "next", "exit"]);

// 使用 musicStore
const musicStore = useMusicStore();

// 窗口控制功能（在 onMounted 中初始化，避免 Tauri 未就绪时访问 metadata 报错）
let appWindow: ReturnType<typeof getCurrentWindow> | null = null;
const isMaximized = ref(false);

// 检查窗口当前是否已最大化
async function checkMaximized() {
  if (!appWindow) return;
  isMaximized.value = await appWindow.isMaximized();
}

// 窗口控制功能
const minimize = async () => {
  if (!appWindow) return;
  await appWindow.minimize();
};

const toggleMaximize = async () => {
  if (!appWindow) return;
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
  isMaximized.value = !isMaximized.value;
};

const close = async () => {
  if (!appWindow) return;
  await appWindow.hide();
};

// 计算最大化/恢复的图标
const maximizeIcon = computed(() => {
  return isMaximized.value ? ScaleToOriginal : FullScreen;
});

// 初始化窗口引用与状态
onMounted(async () => {
  try {
    appWindow = getCurrentWindow();
    await checkMaximized();
  } catch (error) {
    console.error("窗口操作错误:", error);
  }
});

// 本地音乐封面
const localCoverUrl = ref("");

// 图片亮度分析状态
const imageAnalysisState = ref({
  brightness: 0.7, // 默认亮度
  isAnalyzing: false,
  isAnalyzed: false,
});

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

// 组件挂载时加载本地封面
if (props.currentMusic) {
  loadLocalCoverAndLyric();
}

// 获取不带扩展名的文件名（本地文件）
function getFileName(path: string): string {
  if (!path) return "未知歌曲";
  const parts = path.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^/.]+$/, "");
}

// 从歌曲名中提取"-"前面的部分（歌手名）
function extractArtistName(fullName: string): string {
  if (!fullName) return "未知歌手";
  const match = fullName.match(/^(.+?)\s*-\s*.+$/);
  return match ? match[1].trim() : "";
}

// 从歌曲名中提取"-"后面的部分（歌曲名）
function extractSongTitle(fullName: string): string {
  if (!fullName) return "未知歌曲";
  const match = fullName.match(/\s*-\s*(.+)$/);
  return match ? match[1].trim() : fullName;
}

// 格式化艺术家列表
function formatArtists(artists: string[]): string {
  return artists ? artists.join(", ") : "";
}

// 当前歌曲标题 (只包含"-"后面的部分)
const songTitle = computed(() => {
  if (props.currentSong) {
    // 对在线歌曲，也尝试解析名称中的歌曲标题部分
    return extractSongTitle(props.currentSong.name);
  } else if (props.currentMusic) {
    return extractSongTitle(getFileName(props.currentMusic.file_name));
  }
  return "未知歌曲";
});

// 当前歌手名 (从文件名中提取，"-"前面的部分)
const extractedArtistName = computed(() => {
  if (props.currentSong) {
    // 优先使用在线歌曲的艺术家信息
    if (props.currentSong.artists && props.currentSong.artists.length) {
      return formatArtists(props.currentSong.artists);
    }
    // 如果没有艺术家信息，尝试从歌曲名解析
    return extractArtistName(props.currentSong.name);
  } else if (props.currentMusic) {
    return extractArtistName(getFileName(props.currentMusic.file_name));
  }
  return "";
});

// 当前艺术家（整合了从API获取的和从文件名提取的）
const currentArtistName = computed(() => {
  if (
    props.currentSong &&
    props.currentSong.artists &&
    props.currentSong.artists.length
  ) {
    return formatArtists(props.currentSong.artists);
  }
  return extractedArtistName.value;
});

// 当前封面
const currentCoverUrl = computed(() => {
  if (props.currentSong && props.currentSong.pic_url) {
    return props.currentSong.pic_url;
  } else if (localCoverUrl.value) {
    return localCoverUrl.value;
  }

  // return null;
  return musicStore.getDefaultCoverUrl();
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
    background: `linear-gradient(to bottom, 
      rgba(0, 0, 0, ${opacity * 0.6}) 0%, 
      rgba(0, 0, 0, ${opacity * 0.8}) 50%,
      rgba(0, 0, 0, ${opacity * 0.9}) 100%)`,
  };
});

watch(
  // 监听 更新cover
  () => props.currentMusic,
  (newVal) => {
    if (newVal) {
      loadLocalCoverAndLyric();
    }
  },
  { immediate: true }
);

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
      <el-tooltip content="返回" placement="bottom" effect="dark">
        <el-button @click="emit('exit')" :icon="Back" circle class="back-btn" />
      </el-tooltip>

      <div class="window-controls">
        <el-tooltip content="最小化" placement="bottom" effect="dark">
          <el-button @click="minimize" :icon="Minus" circle />
        </el-tooltip>
        <el-tooltip
          :content="isMaximized ? '还原' : '最大化'"
          placement="bottom"
          effect="dark"
        >
          <el-button @click="toggleMaximize" :icon="maximizeIcon" circle />
        </el-tooltip>
        <el-tooltip content="关闭" placement="bottom" effect="dark">
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
            <p class="song-artist" :title="currentArtistName || '未知歌手'">
              {{ currentArtistName || "未知歌手" }}
            </p>
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
        <el-tooltip content="上一曲" placement="top" effect="dark">
          <el-button circle :icon="ArrowLeft" @click="emit('previous')" />
        </el-tooltip>

        <el-tooltip :content="isPlaying ? '暂停' : '播放'" placement="top" effect="dark">
          <el-button
            circle
            size="large"
            :icon="isPlaying ? VideoPause : VideoPlay"
            @click="emit('toggle-play')"
            type="primary"
          />
        </el-tooltip>

        <el-tooltip content="下一曲" placement="top" effect="dark">
          <el-button circle :icon="ArrowRight" @click="emit('next')" />
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ImmersiveView.css" />

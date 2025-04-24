<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import { Folder, Search, Refresh } from "@element-plus/icons-vue";
import HeaderBar from "./components/HeaderBar.vue";
import MusicList from "./components/MusicList.vue";
import PlayerBar from "./components/PlayerBar.vue";

// 音乐文件列表
const musicFiles = ref<Array<{ id: number; file_name: string }>>([]);
// 当前选择的目录
const currentDirectory = ref("");
// 当前播放的音乐
const currentMusic = ref<{ id: number; file_name: string } | null>(null);
// 播放状态
const isPlaying = ref(false);

// 加载音乐文件
async function loadMusicFiles(path: string) {
  try {
    currentDirectory.value = path;
    musicFiles.value = await invoke("scan_files", { path });
  } catch (error) {
    console.error("加载音乐文件失败:", error);
    ElMessage.error(`加载音乐文件失败: ${error}`);
  }
}

// 选择文件夹
async function selectDirectory() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择音乐文件夹",
    });

    if (selected && typeof selected === "string") {
      await loadMusicFiles(selected);
    }
  } catch (error) {
    console.error("选择文件夹失败:", error);
    ElMessage.error(`选择文件夹失败: ${error}`);
  }
}

// 播放音乐
async function playMusic(music: { id: number; file_name: string }) {
  try {
    currentMusic.value = music;
    isPlaying.value = true;
    const fullPath = `${currentDirectory.value}/${music.file_name}`;
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: fullPath,
      }),
    });
  } catch (error) {
    console.error("播放音乐失败:", error);
    ElMessage.error(`播放音乐失败: ${error}`);
  }
}

// 暂停/恢复播放
async function togglePlay() {
  if (isPlaying.value) {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "pause",
      }),
    });
  } else {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "recovery",
      }),
    });
  }
  isPlaying.value = !isPlaying.value;
}

// 调整音量
async function adjustVolume(volume: number) {
  await invoke("handle_event", {
    event: JSON.stringify({
      action: "volume",
      volume,
    }),
  });
}

// 刷新当前目录
async function refreshCurrentDirectory() {
  if (currentDirectory.value) {
    await loadMusicFiles(currentDirectory.value);
  }
}

// 初始化加载默认音乐目录
onMounted(async () => {
  try {
    const defaultDir = await invoke("get_default_music_dir");
    if (defaultDir) {
      await loadMusicFiles(defaultDir as string);
    }
  } catch (error) {
    console.error("加载默认目录失败:", error);
  }
});
</script>

<template>
  <div class="music-app">
    <!-- 顶部搜索和文件夹选择 -->
    <HeaderBar
      :currentDirectory="currentDirectory"
      @select-directory="selectDirectory"
      @refresh="refreshCurrentDirectory"
    />

    <!-- 主内容区域 - 歌曲列表 -->
    <div class="main-content">
      <MusicList
        :musicFiles="musicFiles"
        :currentMusic="currentMusic"
        :isPlaying="isPlaying"
        @play="playMusic"
      />
    </div>

    <!-- 底部播放控制栏 -->
    <PlayerBar
      :currentMusic="currentMusic"
      :isPlaying="isPlaying"
      @toggle-play="togglePlay"
      @volume-change="adjustVolume"
    />
  </div>
</template>

<style>
.music-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden; /* 防止出现滑动条 */
}

.main-content {
  flex: 1;
  overflow: hidden; /* 修改为hidden，让子组件控制滚动 */
  padding: 16px;
  box-sizing: border-box; /* 确保padding不会导致超出容器 */
}

body {
  margin: 0;
  padding: 0; /* 确保body没有padding */
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
  overflow: hidden; /* 防止body出现滑动条 */
}

html {
  overflow: hidden; /* 防止html出现滑动条 */
}
</style>

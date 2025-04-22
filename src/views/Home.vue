<template>
  <div class="music-player-container">
    <div class="header">
      <button class="btn choose-btn" @click="chooseMusicFolder">
        Choose folder
      </button>
      <div v-if="totalPages > 1" class="pagination">
        <button
          @click="changePage(currentPage - 1)"
          :disabled="currentPage === 1"
          class="page-btn"
        >
          Last
        </button>
        <span class="page-info"> {{ currentPage }} / {{ totalPages }} </span>
        <button
          @click="changePage(currentPage + 1)"
          :disabled="currentPage >= totalPages"
          class="page-btn"
        >
          Next
        </button>
      </div>
    </div>

    <div class="music-list">
      <div
        v-for="(item, index) in paginatedMusicFiles"
        :key="item.id"
        class="music-item"
        :class="{ playing: currentMusic && item.id === currentMusic.id }"
        @click="rowClick(item)"
      >
        <span class="item-number">{{
          (currentPage - 1) * pageSize + index + 1
        }}</span>
        <span class="item-name">{{ item.file_name }}</span>
        <span
          class="item-play-icon"
          v-if="currentMusic && item.id === currentMusic.id"
        >
          ▶
        </span>
      </div>
    </div>

    <div class="player-controls">
      <div class="now-playing">
        <img src="/tauri.svg" class="music-icon" />
        <span class="current-song">{{ currAudioName }}</span>
      </div>

      <div class="control-buttons">
        <button class="control-btn" @click="preAudio">⏮️</button>
        <button
          class="control-btn play-btn"
          @click="isPlaying ? pauseAudio() : recoveryAudio()"
        >
          {{ isPlaying ? "pause" : "play" }}
        </button>
        <button class="control-btn" @click="nextAudio">⏭️</button>
      </div>

      <div class="volume-control">
        <button class="volume-btn" @click="toggleMute">
          {{ isMuted ? "🔇" : "🔊" }}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          v-model="volume"
          @input="changeVolume"
          class="volume-slider"
        />
      </div>
    </div>
  </div>
</template>
  
<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import musicStore from "../store/musicState";

const tableData = ref([]);
const playMode = ref("list");
const checkInterval = ref(null);
const isMuted = ref(false);
const previousVolume = ref(50);

const musicPath = computed(() => musicStore.state.localMusic.musicPath);
const musicFiles = computed(() => musicStore.state.localMusic.musicFiles);
const currentMusic = computed(() => musicStore.state.localMusic.currentMusic);
const isPlaying = computed(() => musicStore.state.localMusic.isPlaying);
const volume = computed({
  get: () => musicStore.state.localMusic.volume,
  set: (value) => musicStore.mutations.setLocalMusicVolume(value),
});

const currentPage = computed(() => musicStore.state.localMusic.currentPage);
const pageSize = computed(() => musicStore.state.localMusic.pageSize);
const totalPages = computed(() => {
  if (musicFiles.value.length === 0) return 1;
  return Math.ceil(musicFiles.value.length / pageSize.value);
});

const paginatedMusicFiles = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  return musicFiles.value.slice(startIndex, endIndex);
});

watch(
  musicFiles,
  (newFiles) => {
    tableData.value = [...newFiles];
  },
  { deep: true }
);

const currAudioName = computed(() => {
  return currentMusic.value?.file_name || "no music playing";
});

async function loadDefaultMusicDir() {
  try {
    const defaultMusicDir = await invoke("get_default_music_dir");
    if (defaultMusicDir) {
      musicStore.mutations.setMusicPath(defaultMusicDir);
      await scanMusicFiles(defaultMusicDir);
    }
  } catch (error) {
    console.error("Load default music dir error:", error);
  }
}

async function chooseMusicFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "choose music folder",
    });

    if (selected) {
      musicStore.mutations.setMusicPath(selected);
      await scanMusicFiles(selected);
    }
  } catch (error) {
    console.error("error:", error);
  }
}

async function scanMusicFiles(path) {
  try {
    const files = await invoke("scan_files", { path });
    musicStore.mutations.setMusicFiles(files);
    musicStore.mutations.setLocalMusicCurrentPage(1);

    if (
      currentMusic.value &&
      !files.some((m) => m.id === currentMusic.value.id)
    ) {
      musicStore.mutations.setCurrentMusic(null);
      musicStore.mutations.setLocalMusicPlaying(false);
    }
  } catch (error) {
    console.error("scan files error:", error);
  }
}

function rowClick(row) {
  playAudio(row);
}

async function playAudio(music) {
  try {
    musicStore.mutations.setCurrentMusic(music);
    const fullPath = `${musicPath.value}/${music.file_name}`;

    musicStore.mutations.setGlobalSource("local");
    musicStore.mutations.setGlobalPlayingUrl(fullPath);

    await invoke("handle_event", {
      event: JSON.stringify({
        action: "play",
        path: fullPath,
      }),
    });

    musicStore.mutations.setLocalMusicPlaying(true);
    musicStore.mutations.setGlobalPlaying(true);
  } catch (error) {
    console.error("play music error:", error);
  }
}

async function recoveryAudio() {
  if (
    !currentMusic.value &&
    musicStore.state.globalMusic.currentSource !== "local"
  ) {
    if (
      musicStore.state.globalMusic.currentSource === "netease" &&
      musicStore.state.globalMusic.isPlaying
    ) {
      return;
    }
  }

  try {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "recovery",
      }),
    });

    musicStore.mutations.setLocalMusicPlaying(true);
    musicStore.mutations.setGlobalPlaying(true);
  } catch (error) {
    console.error("recover music error:", error);
  }
}

async function pauseAudio() {
  try {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "pause",
      }),
    });

    musicStore.mutations.setLocalMusicPlaying(false);
    musicStore.mutations.setGlobalPlaying(false);
  } catch (error) {
    console.error("pause music error:", error);
  }
}

function preAudio() {
  if (musicFiles.value.length === 0) return;

  const fullFilesList = musicFiles.value;
  const currentIndex = currentMusic.value
    ? fullFilesList.findIndex((item) => item.id === currentMusic.value.id)
    : -1;

  let newIndex = currentIndex - 1;
  if (newIndex < 0) {
    newIndex = fullFilesList.length - 1;
  }

  const newPage = Math.floor(newIndex / pageSize.value) + 1;
  if (newPage !== currentPage.value) {
    musicStore.mutations.setLocalMusicCurrentPage(newPage);
  }

  playAudio(fullFilesList[newIndex]);
}

function nextAudio() {
  if (musicFiles.value.length === 0) return;

  const fullFilesList = musicFiles.value;
  const currentIndex = currentMusic.value
    ? fullFilesList.findIndex((item) => item.id === currentMusic.value.id)
    : -1;

  let newIndex = currentIndex + 1;
  if (newIndex >= fullFilesList.length) {
    newIndex = 0;
  }

  const newPage = Math.floor(newIndex / pageSize.value) + 1;
  if (newPage !== currentPage.value) {
    musicStore.mutations.setLocalMusicCurrentPage(newPage);
  }

  playAudio(fullFilesList[newIndex]);
}

function changePage(page) {
  if (page < 1 || page > totalPages.value) return;
  musicStore.mutations.setLocalMusicCurrentPage(page);
}

function toggleMute() {
  if (isMuted.value) {
    musicStore.mutations.setLocalMusicVolume(previousVolume.value);
    isMuted.value = false;
  } else {
    previousVolume.value = volume.value;
    musicStore.mutations.setLocalMusicVolume(0);
    isMuted.value = true;
  }

  changeVolume();
}

async function changeVolume() {
  try {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "volume",
        volume: Number(volume.value),
      }),
    });

    isMuted.value = volume.value === 0;
  } catch (error) {
    console.error("adjust volume error:", error);
  }
}

async function checkSinkStatus() {
  try {
    const isEmpty = await invoke("is_sink_empty");
    if (isEmpty && isPlaying.value) {
      if (playMode.value === "list") {
        nextAudio();
      } else if (playMode.value === "single" && currentMusic.value) {
        playAudio(currentMusic.value);
      }
    }
  } catch (error) {
    console.error("check status error:", error);
  }
}

onMounted(async () => {
  checkInterval.value = setInterval(checkSinkStatus, 1000);

  if (musicPath.value) {
    await scanMusicFiles(musicPath.value);
  } else {
    await loadDefaultMusicDir();
  }

  if (
    musicStore.state.globalMusic.isPlaying &&
    musicStore.state.globalMusic.currentSource === "netease"
  ) {
    console.log("netease music is playing, not local music");
  }
});

onBeforeUnmount(() => {
  if (checkInterval.value) {
    clearInterval(checkInterval.value);
  }
});
</script>
  
<style scoped>
.music-player-container {
  padding: 20px;
  height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 1.2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.btn {
  padding: 0.6rem 1.2rem;
  background-color: #4a86e8;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn:hover {
  background-color: #3a76d8;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.music-list {
  flex: 1;
  overflow-y: auto;
  background-color: white;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.music-list::-webkit-scrollbar {
  display: none;
}

.music-item {
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.music-item:hover {
  background-color: #f0f8ff;
}

.playing {
  background-color: #e6f2ff;
  border-left: 3px solid #4a86e8;
}

.item-number {
  width: 30px;
  color: #999;
  font-size: 0.9rem;
}

.item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 10px;
}

.item-play-icon {
  color: #4a86e8;
  margin-left: 10px;
}

.player-controls {
  padding: 1.2rem;
  background-color: #f7f7f7;
  border-radius: 8px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  border-top: 1px solid #eaeaea;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.03);
}

.now-playing {
  display: flex;
  align-items: center;
  width: 40%;
}

.music-icon {
  width: 48px;
  height: 48px;
  margin-right: 12px;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.current-song {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.control-buttons {
  display: flex;
  gap: 15px;
}

.control-btn {
  padding: 0.6rem 1.2rem;
  background-color: #f5f5f5;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.control-btn:hover {
  transform: scale(1.05);
  background-color: #e9e9e9;
}

.play-btn {
  background-color: #4a86e8;
  color: white;
  padding: 0.6rem 1.5rem;
}

.play-btn:hover {
  background-color: #3a76d8;
}

.volume-control {
  width: 15%;
  display: flex;
  align-items: center;
  gap: 12px;
}

.volume-btn {
  width: 15%;
  background: none;
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  border-radius: 2px;
  color: #555;
}

.volume-slider {
  width: 100px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  outline: none;
  border-radius: 2px;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #4a86e8;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #4a86e8;
  cursor: pointer;
  border: none;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 10px;
}

.page-btn {
  padding: 8px 15px;
  background: #4a86e8;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin: 0 10px;
}

.page-btn:hover {
  background-color: #3a76d8;
}

.page-btn:disabled {
  background-color: #ccc;
  cursor: default;
}

.page-info {
  font-size: 16px;
  color: #666;
}

@supports (-webkit-touch-callout: none) {
  .music-list {
    -webkit-overflow-scrolling: touch;
  }
}
</style>
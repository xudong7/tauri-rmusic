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
        <button class="control-btn" @click="preAudio">⏮</button>
        <button
          class="control-btn play-btn"
          @click="isPlaying ? pauseAudio() : recoveryAudio()"
        >
          {{ isPlaying ? "⏸" : "▶" }}
        </button>
        <button class="control-btn" @click="nextAudio">⏭</button>
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
@import "../css/Home.css";
</style>
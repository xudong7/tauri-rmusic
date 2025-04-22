<template>
  <div class="netease-container">
    <div class="search-section">
      <div class="search-bar">
        <input
          type="text"
          v-model="searchKeyword"
          @keyup.enter="searchSongs"
          placeholder="Searching Song、Singer..."
          class="search-input"
        />
        <button @click="searchSongs" class="search-button">
          <span>Search</span>
        </button>
      </div>
    </div>

    <div v-if="musicState.state.neteaseMusic.loading" class="loading">
      <div class="spinner"></div>
      <span>Searching...</span>
    </div>

    <div
      v-else-if="musicState.state.neteaseMusic.searchResults.length > 0"
      class="search-results"
    >
      <table class="song-table">
        <thead>
          <tr>
            <th style="width: 50px"></th>
            <th style="width: 35%">Song</th>
            <th style="width: 25%">Singer</th>
            <th style="width: 20%">Album</th>
            <th style="width: 10%">Time</th>
            <th style="width: 10%">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="song in musicState.state.neteaseMusic.searchResults"
            :key="song.id"
            @dblclick="playSong(song)"
            :class="{ playing: isCurrentSong(song) }"
          >
            <td class="play-cell">
              <button class="play-btn" @click="playSong(song)">
                <span
                  v-if="
                    isCurrentSong(song) &&
                    musicState.state.neteaseMusic.isPlaying
                  "
                >
                  ■
                </span>
                <span v-else>▶</span>
              </button>
            </td>
            <td>
              <div class="song-info">
                <img
                  v-if="song.pic_url"
                  :src="song.pic_url"
                  class="song-cover"
                  @click="enterImmersiveMode(song)"
                />
                <span class="song-name">{{ song.name }}</span>
              </div>
            </td>
            <td>{{ song.artists.join(", ") }}</td>
            <td>{{ song.album }}</td>
            <td>{{ formatDuration(song.duration) }}</td>
            <td>
              <button
                class="download-btn"
                @click="downloadSong(song)"
                :disabled="downloadingMap[song.id]"
                :title="downloadingMap[song.id] ? 'Downloading...' : 'Download'"
              >
                <span v-if="downloadingMap[song.id]">⏳</span>
                <span v-else>⬇️</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="pagination">
        <button
          @click="changePage(musicState.state.neteaseMusic.currentPage - 1)"
          :disabled="musicState.state.neteaseMusic.currentPage === 1"
          class="page-btn"
        >
          Last
        </button>
        <span class="page-info">
          {{ musicState.state.neteaseMusic.currentPage }} /
          {{
            Math.ceil(
              musicState.state.neteaseMusic.totalCount /
                musicState.state.neteaseMusic.pageSize
            )
          }}
        </span>
        <button
          @click="changePage(musicState.state.neteaseMusic.currentPage + 1)"
          :disabled="
            musicState.state.neteaseMusic.currentPage >=
            Math.ceil(
              musicState.state.neteaseMusic.totalCount /
                musicState.state.neteaseMusic.pageSize
            )
          "
          class="page-btn"
        >
          Next
        </button>
      </div>
    </div>

    <div
      v-else-if="musicState.state.neteaseMusic.searchKeyword"
      class="no-results"
    >
      No results found for "{{ musicState.state.neteaseMusic.searchKeyword }}"
    </div>

    <div v-else class="welcome-message">
      <div class="welcome-icon">🎵</div>
      <p>Search for your favorite songs!</p>
    </div>

    <div v-if="musicState.state.neteaseMusic.currentSong" class="player-bar">
      <div class="song-details">
        <img
          v-if="musicState.state.neteaseMusic.currentSong.pic_url"
          :src="musicState.state.neteaseMusic.currentSong.pic_url"
          class="current-song-cover"
        />
        <div class="current-song-info">
          <div class="current-song-name">
            {{ musicState.state.neteaseMusic.currentSong.name }}
          </div>
          <div class="current-song-artist">
            {{ musicState.state.neteaseMusic.currentSong.artists.join(", ") }}
          </div>
        </div>
      </div>
      <div class="player-controls">
        <button @click="togglePlay" class="control-btn">
          <span v-if="musicState.state.neteaseMusic.isPlaying">⏸️</span>
          <span v-else>▶️</span>
        </button>
      </div>
    </div>

    <div
      v-if="showDownloadMessage"
      class="download-message"
      :class="downloadStatus"
    >
      {{ downloadMessage }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onBeforeUnmount, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import musicState from "../store/musicState";

export default {
  name: "NeteaseView",
  setup() {
    const searchKeyword = ref("");
    const playingUrl = ref("");
    const isImmersiveMode = ref(false); // 是否处于沉浸模式
    const lyrics = ref("暂无歌词"); // 歌词内容，目前没有实际获取歌词的功能

    const searchSongs = async () => {
      if (!searchKeyword.value.trim()) return;

      musicState.mutations.setNeteaseSearchKeyword(searchKeyword.value);
      musicState.mutations.setNeteaseLoading(true);

      try {
        const result = await invoke("search_songs", {
          keywords: searchKeyword.value,
          page: musicState.state.neteaseMusic.currentPage,
          pagesize: musicState.state.neteaseMusic.pageSize,
        });

        musicState.mutations.setNeteaseSearchResults(result.songs);
        musicState.mutations.setNeteaseTotalCount(result.total);
      } catch (error) {
        console.error("Search songs error:", error);
        musicState.mutations.setNeteaseSearchResults([]);
      } finally {
        musicState.mutations.setNeteaseLoading(false);
      }
    };

    const changePage = (page) => {
      musicState.mutations.setNeteaseCurrentPage(page);
      searchSongs();
    };

    const formatDuration = (ms) => {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const playSong = async (song) => {
      try {
        musicState.mutations.setNeteaseCurrentSong(song);
        musicState.mutations.setNeteaseLoading(true);

        const songUrl = await invoke("play_netease_song", {
          id: song.file_hash,
        });

        if (!songUrl) {
          console.error("get songUrl error:", songUrl);
          return;
        }

        playingUrl.value = songUrl;

        musicState.mutations.setGlobalSource("netease");
        musicState.mutations.setGlobalPlayingUrl(songUrl);

        await invoke("handle_event", {
          event: JSON.stringify({
            action: "play",
            path: songUrl,
          }),
        });

        musicState.mutations.setNeteasePlaying(true);
        musicState.mutations.setGlobalPlaying(true);
      } catch (error) {
        console.error("Play song error:", error);
      } finally {
        musicState.mutations.setNeteaseLoading(false);
      }
    };

    const togglePlay = async () => {
      try {
        if (musicState.state.neteaseMusic.isPlaying) {
          await invoke("handle_event", {
            event: JSON.stringify({ action: "pause" }),
          });
          musicState.mutations.setNeteasePlaying(false);
          musicState.mutations.setGlobalPlaying(false);
        } else {
          await invoke("handle_event", {
            event: JSON.stringify({ action: "recovery" }),
          });
          musicState.mutations.setNeteasePlaying(true);
          musicState.mutations.setGlobalPlaying(true);
        }
      } catch (error) {
        console.error("toggle status error:", error);
      }
    };

    const isCurrentSong = (song) => {
      return (
        musicState.state.neteaseMusic.currentSong &&
        musicState.state.neteaseMusic.currentSong.id === song.id
      );
    };

    const downloadingMap = ref({});
    const showDownloadMessage = ref(false);
    const downloadMessage = ref("");
    const downloadStatus = ref("");

    const downloadSong = async (song) => {
      try {
        downloadingMap.value = { ...downloadingMap.value, [song.id]: true };

        const artistName =
          song.artists.length > 0 ? song.artists[0] : "unknown artist";

        const fileName = await invoke("download_music", {
          songHash: song.file_hash,
          songName: song.name,
          artist: artistName,
        });

        downloadMessage.value = `Song "${song.name}" Downloaded successfully!`;
        downloadStatus.value = "success";
        showDownloadMessage.value = true;

        setTimeout(() => {
          showDownloadMessage.value = false;
        }, 3000);
      } catch (error) {
        console.error("Download error:", error);

        downloadMessage.value = `Download error: ${error}`;
        downloadStatus.value = "error";
        showDownloadMessage.value = true;

        setTimeout(() => {
          showDownloadMessage.value = false;
        }, 3000);
      } finally {
        const newDownloadingMap = { ...downloadingMap.value };
        delete newDownloadingMap[song.id];
        downloadingMap.value = newDownloadingMap;
      }
    };

    const enterImmersiveMode = (song) => {
      if (!song) return;
      isImmersiveMode.value = true;
      // 如果歌曲没有在播放，则开始播放
      if (!isCurrentSong(song) || !musicState.state.neteaseMusic.isPlaying) {
        playSong(song);
      }
    };

    const exitImmersiveMode = () => {
      isImmersiveMode.value = false;
    };

    onBeforeUnmount(() => {
      console.log("Keep alive NeteaseView");
    });

    onMounted(() => {
      if (musicState.state.neteaseMusic.searchKeyword) {
        searchKeyword.value = musicState.state.neteaseMusic.searchKeyword;
        searchSongs();
      }

      if (
        musicState.state.globalMusic.currentSource === "netease" &&
        musicState.state.globalMusic.isPlaying
      ) {
        musicState.mutations.setNeteasePlaying(true);
      }
    });

    return {
      searchKeyword,
      musicState,
      searchSongs,
      playSong,
      togglePlay,
      changePage,
      formatDuration,
      isCurrentSong,
      downloadSong,
      downloadingMap,
      showDownloadMessage,
      downloadMessage,
      downloadStatus,
      isImmersiveMode,
      enterImmersiveMode,
      exitImmersiveMode,
      lyrics,
    };
  },
};
</script>

<style scoped>
.netease-container {
  padding: 20px;
  height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  color: #333;
}

.search-section {
  padding: 1.2rem;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}

.search-bar {
  display: flex;
  width: 100%;
}

.search-input {
  flex: 1;
  padding: 0.6rem 1.2rem;
  border: 1px solid #ddd;
  border-radius: 6px 0 0 6px;
  font-size: 16px;
  outline: none;
}

.search-button {
  padding: 0.6rem 1.2rem;
  background-color: #4a86e8;
  color: white;
  border: none;
  border-radius: 0 6px 6px 0;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.search-button:hover {
  background-color: #3a76d8;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #4a86e8;
  border-top: 3px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.search-results {
  flex: 1;
  overflow-y: auto;
  background-color: white;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.search-results::-webkit-scrollbar {
  display: none;
}

.song-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}

.song-table th {
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #eaeaea;
  color: #666;
  font-weight: 500;
}

.song-table td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.song-table tr:hover {
  background-color: #f0f8ff;
}

.song-table tr.playing {
  background-color: #e6f2ff;
  border-left: 3px solid #4a86e8;
}

.song-info {
  display: flex;
  align-items: center;
}

.song-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  margin-right: 10px;
  object-fit: cover;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.song-name {
  font-weight: 500;
}

.play-cell {
  text-align: center;
}

.play-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background-color: #4a86e8;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.play-btn:hover {
  background-color: #3a76d8;
  transform: scale(1.05);
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
  background-color: #4a86e8;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin: 0 10px;
  transition: all 0.2s ease;
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

.welcome-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  text-align: center;
}

.welcome-icon {
  font-size: 60px;
  margin-bottom: 20px;
  color: #4a86e8;
}

.no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
  font-size: 18px;
}

.player-bar {
  padding: 1.2rem;
  background-color: #fff;
  border-top: 1px solid #eaeaea;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.03);
  z-index: 1000;
}

.song-details {
  display: flex;
  align-items: center;
  width: 40%;
}

.current-song-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  margin-right: 15px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.current-song-info {
  display: flex;
  flex-direction: column;
}

.current-song-name {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.current-song-artist {
  font-size: 14px;
  color: #666;
}

.player-controls {
  display: flex;
  align-items: center;
}

.control-btn {
  padding: 0.6rem 1.2rem;
  background-color: #4a86e8;
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover {
  transform: scale(1.05);
  background-color: #3a76d8;
}

.download-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background-color: #4a86e8;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.download-btn:hover:not([disabled]) {
  background-color: #3a76d8;
  transform: scale(1.05);
}

.download-btn[disabled] {
  background-color: #cccccc;
  cursor: not-allowed;
  opacity: 0.7;
}

.download-message {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  z-index: 100;
  transition: all 0.3s ease;
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.success {
  background-color: #4caf50;
}

.error {
  background-color: #f44336;
}

@supports (-webkit-touch-callout: none) {
  .search-results {
    -webkit-overflow-scrolling: touch;
  }
}
</style>
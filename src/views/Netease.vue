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
            <th style="width: 40%">Song</th>
            <th style="width: 30%">Singer</th>
            <th style="width: 20%">Album</th>
            <th style="width: 10%">Time</th>
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
                />
                <span class="song-name">{{ song.name }}</span>
              </div>
            </td>
            <td>{{ song.artists.join(", ") }}</td>
            <td>{{ song.album }}</td>
            <td>{{ formatDuration(song.duration) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="pagination">
        <button
          @click="changePage(musicState.state.neteaseMusic.currentPage - 1)"
          :disabled="musicState.state.neteaseMusic.currentPage === 1"
          class="page-btn"
        >
          上一页
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
          下一页
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

    const searchSongs = async () => {
      if (!searchKeyword.value.trim()) return;

      musicState.mutations.setNeteaseSearchKeyword(searchKeyword.value);
      musicState.mutations.setNeteaseLoading(true);

      try {
        const result = await invoke("search_songs", {
          keywords: searchKeyword.value,
          // limit: musicState.state.neteaseMusic.pageSize,
          // offset: (musicState.state.neteaseMusic.currentPage - 1) * musicState.state.neteaseMusic.pageSize
        });

        musicState.mutations.setNeteaseSearchResults(result.songs);
        musicState.mutations.setNeteaseTotalCount(result.total);
      } catch (error) {
        console.error("Search song error:", error);
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

    onBeforeUnmount(() => {
      console.log("保持网易云音乐播放状态");
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
    };
  },
};
</script>

<style scoped>
.netease-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background-color: #f9f9f9;
  color: #333;
}

.search-section {
  margin-bottom: 20px;
}

.search-bar {
  display: flex;
  width: 100%;
}

.search-input {
  flex: 1;
  padding: 10px 15px;
  border: 1px solid #ddd;
  border-radius: 4px 0 0 4px;
  font-size: 16px;
}

.search-button {
  padding: 10px 20px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
  font-size: 16px;
}

.search-button:hover {
  background-color: #c0392b;
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
  border: 3px solid #e74c3c;
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

.song-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}

.song-table th {
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #ddd;
  color: #666;
  font-weight: 500;
}

.song-table td {
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.song-table tr:hover {
  background-color: #f5f5f5;
}

.song-table tr.playing {
  background-color: #fdeaea;
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
  background-color: #e74c3c;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-btn:hover {
  background-color: #c0392b;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
}

.page-btn {
  padding: 8px 15px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin: 0 10px;
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
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background-color: white;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 1000;
}

.song-details {
  display: flex;
  align-items: center;
}

.current-song-cover {
  width: 60px;
  height: 60px;
  border-radius: 4px;
  margin-right: 15px;
}

.current-song-info {
  display: flex;
  flex-direction: column;
}

.current-song-name {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 5px;
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
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background-color: #e74c3c;
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 10px;
}

.control-btn:hover {
  background-color: #c0392b;
}
</style>
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
                <span v-else>⬇</span>
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

    <div v-if="isImmersiveMode" class="immersive-mode">
      <div class="immersive-overlay"></div>
      <div class="immersive-top-buttons">
        <button class="minimize-btn" @click="exitImmersiveMode">
          <span>﹀</span>
        </button>
      </div>
      <div class="immersive-content">
        <div class="immersive-main">
          <div class="album-display">
            <img
              v-if="musicState.state.neteaseMusic.currentSong?.pic_url"
              :src="musicState.state.neteaseMusic.currentSong.pic_url"
              class="immersive-album-cover"
            />
          </div>
          <div class="song-info-display">
            <div class="song-title-section">
              <h2 class="immersive-song-title">
                {{ musicState.state.neteaseMusic.currentSong?.name }}
              </h2>
              <p class="artists-line">
                {{
                  musicState.state.neteaseMusic.currentSong?.artists.join(" / ")
                }}
              </p>
            </div>

            <div class="lyrics-container">
              <div class="lyrics-wrapper" ref="lyricsWrapper">
                <p
                  v-for="(line, index) in visibleLyrics"
                  :key="index"
                  :class="{ active: currentVisibleIndex === index }"
                  :ref="
                    (el) => {
                      if (el) lyricLineRefs[index] = el;
                    }
                  "
                  class="lyric-line"
                >
                  {{ line.text }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="immersive-controls-container">
          <div class="playback-info">
            <div class="current-song-info-mini">
              {{ musicState.state.neteaseMusic.currentSong?.artists[0] }} -
              {{ musicState.state.neteaseMusic.currentSong?.name }}
            </div>
          </div>
          <div class="playback-controls">
            <button
              class="player-control-btn prev-btn"
              @click="playPrevious"
              :disabled="!hasPrevious"
            >
              <span>⏮</span>
            </button>
            <button
              class="player-control-btn play-pause-btn"
              @click="togglePlay"
            >
              <span v-if="musicState.state.neteaseMusic.isPlaying">⏸</span>
              <span v-else>▶</span>
            </button>
            <button
              class="player-control-btn next-btn"
              @click="playNext"
              :disabled="!hasNext"
            >
              <span>⏭</span>
            </button>

            <button class="player-control-btn volume-btn">
              <span>🔊</span>
            </button>
            <div class="progress-bar">
              <div class="time-passed">{{ formatTime(currentTime) }}</div>
              <div class="progress-track">
                <div
                  class="progress-fill"
                  :style="{ width: progressPercentage + '%' }"
                ></div>
              </div>
              <div class="time-total">{{ formatTime(totalDuration) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="musicState.state.neteaseMusic.currentSong" class="player-bar">
      <div class="song-details">
        <img
          v-if="musicState.state.neteaseMusic.currentSong.pic_url"
          :src="musicState.state.neteaseMusic.currentSong.pic_url"
          class="current-song-cover"
          @click="enterImmersiveMode(musicState.state.neteaseMusic.currentSong)"
          style="cursor: pointer"
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
        <button
          @click="playPrevious"
          class="normal-btn prev-btn"
          :disabled="!hasPrevious"
        >
          <span>⏮</span>
        </button>
        <button @click="togglePlay" class="normal-btn normal-play-btn">
          <span v-if="musicState.state.neteaseMusic.isPlaying">⏸</span>
          <span v-else>▶</span>
        </button>
        <button
          @click="playNext"
          class="normal-btn next-btn"
          :disabled="!hasNext"
        >
          <span>⏭</span>
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
import { ref, computed, onBeforeUnmount, onMounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import musicState from "../store/musicState";

export default {
  name: "NeteaseView",
  setup() {
    const searchKeyword = ref("");
    const playingUrl = ref("");
    const isImmersiveMode = ref(false);
    const lyrics = ref("暂无歌词");
    const parsedLyrics = ref([]);
    const visibleLyrics = ref([]);
    const currentLyricIndex = ref(0);
    const currentVisibleIndex = ref(0);
    const lyricLineRefs = ref({});
    const lyricsWrapper = ref(null);
    const lyricTimer = ref(null);
    const lyricFetchTimeout = ref(null);
    const originalTitle = ref("");
    const currentTime = ref(0);
    const totalDuration = ref(0);
    const progressPercentage = ref(0);
    const autoPlayCheckInterval = ref(null);

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

    const formatTime = (timeInSeconds) => {
      if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";

      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.floor(timeInSeconds % 60);
      return `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
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

        // 设置开始播放时间
        musicState.mutations.setGlobalStartTime(Date.now());
        musicState.mutations.setGlobalPausedTime(0);

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
          // 记录暂停时的时间
          const startTime =
            musicState.state.globalMusic.startTime || Date.now();
          const pausedTime = musicState.state.globalMusic.pausedTime || 0;
          const currentTime = Date.now() - startTime + pausedTime;
          musicState.mutations.setGlobalPausedTime(currentTime);

          await invoke("handle_event", {
            event: JSON.stringify({ action: "pause" }),
          });
          musicState.mutations.setNeteasePlaying(false);
          musicState.mutations.setGlobalPlaying(false);
        } else {
          // 恢复播放时，记录新的开始时间
          musicState.mutations.setGlobalStartTime(Date.now());

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

    const enterImmersiveMode = async (song) => {
      if (!song) return;
      isImmersiveMode.value = true;
      if (!isCurrentSong(song) || !musicState.state.neteaseMusic.isPlaying) {
        await playSong(song);
      }

      await fetchLyrics(song);

      startLyricScroll();

      if (song.name.includes("-")) {
        originalTitle.value = song.name;
      } else if (song.artists.length > 0) {
        originalTitle.value = `${song.name} - ${song.artists[0]}`;
      }

      totalDuration.value = song.duration / 1000;

      document.body.style.overflow = "hidden";

      startProgressUpdate();
    };

    const startProgressUpdate = () => {
      const progressInterval = setInterval(() => {
        if (!isImmersiveMode.value) {
          clearInterval(progressInterval);
          return;
        }

        getCurrentPlayTime()
          .then((time) => {
            currentTime.value = time;
            if (totalDuration.value > 0) {
              progressPercentage.value =
                (currentTime.value / totalDuration.value) * 100;
            }
          })
          .catch((err) => {
            console.error("获取播放时间失败:", err);
          });
      }, 1000);
    };

    const exitImmersiveMode = () => {
      isImmersiveMode.value = false;
      document.body.style.overflow = "";

      clearInterval(lyricTimer.value);
      lyricTimer.value = null;

      if (lyricFetchTimeout.value) {
        clearTimeout(lyricFetchTimeout.value);
        lyricFetchTimeout.value = null;
      }
    };

    const fetchLyrics = async (song) => {
      try {
        lyrics.value = "正在加载歌词...";
        parsedLyrics.value = [];
        currentLyricIndex.value = 0;

        if (!song || !song.file_hash) {
          console.error("无效的歌曲信息或file_hash");
          lyrics.value = "无法获取歌词: 缺少歌曲信息";
          parsedLyrics.value = [{ time: 0, text: "无法获取歌词" }];
          return;
        }

        console.log("获取歌词信息，hash:", song.file_hash);

        const lyricInfo = await invoke("search_lyric", {
          hash: song.file_hash,
        }).catch((err) => {
          console.error("获取歌词信息失败:", err);
          return null;
        });

        if (lyricInfo && lyricInfo.id && lyricInfo.accesskey) {
          console.log("成功获取歌词信息:", lyricInfo);

          if (lyricFetchTimeout.value) {
            clearTimeout(lyricFetchTimeout.value);
          }

          lyricFetchTimeout.value = setTimeout(() => {
            if (parsedLyrics.value.length === 0) {
              lyrics.value = "暂无歌词";
              parsedLyrics.value = [{ time: 0, text: "暂无歌词" }];
            }
          }, 5000);

          try {
            const lyricContent = await invoke("get_lyric_decoded", {
              id: lyricInfo.id,
              accesskey: lyricInfo.accesskey,
            });

            if (lyricFetchTimeout.value) {
              clearTimeout(lyricFetchTimeout.value);
              lyricFetchTimeout.value = null;
            }

            if (lyricContent) {
              lyrics.value = lyricContent;
              parseLyrics(lyricContent);
            } else {
              console.log("未获取到歌词内容");
              lyrics.value = "暂无歌词";
              parsedLyrics.value = [{ time: 0, text: "暂无歌词" }];
            }
          } catch (error) {
            console.error("获取歌词内容失败:", error);
            lyrics.value =
              "获取歌词失败: " +
              (typeof error === "string" ? error : JSON.stringify(error));
            parsedLyrics.value = [{ time: 0, text: "获取歌词失败" }];
          }
        } else {
          console.log("未获取到歌词信息或信息不完整:", lyricInfo);
          lyrics.value = "暂无歌词";
          parsedLyrics.value = [{ time: 0, text: "暂无歌词" }];
        }
      } catch (error) {
        console.error("获取歌词失败:", error);
        lyrics.value =
          "获取歌词失败: " +
          (typeof error === "string" ? error : JSON.stringify(error));
        parsedLyrics.value = [{ time: 0, text: "获取歌词失败" }];
      }
    };

    const parseLyrics = (lyricContent) => {
      const regex = /^\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;

      const lines = lyricContent.split("\n");
      const result = [];

      lines.forEach((line) => {
        const match = line.match(regex);
        if (match) {
          const minutes = parseInt(match[1]);
          const seconds = parseInt(match[2]);
          const milliseconds = parseInt(match[3]) * 10;
          const text = match[4].trim();

          const time = minutes * 60000 + seconds * 1000 + milliseconds;
          if (text) {
            result.push({ time, text });
          }
        }
      });

      result.sort((a, b) => a.time - b.time);

      if (result.length === 0) {
        result.push({ time: 0, text: "暂无歌词" });
      }

      parsedLyrics.value = result;
    };

    const startLyricScroll = () => {
      if (lyricTimer.value) {
        clearInterval(lyricTimer.value);
      }

      currentLyricIndex.value = 0;

      const immersiveControls = document.querySelector(
        ".immersive-controls-container"
      );
      const albumDisplay = document.querySelector(".album-display");
      if (immersiveControls) immersiveControls.style.display = "flex";
      if (albumDisplay) albumDisplay.style.display = "flex";

      lyricTimer.value = setInterval(() => {
        if (!isImmersiveMode.value || parsedLyrics.value.length === 0) {
          clearInterval(lyricTimer.value);
          lyricTimer.value = null;
          return;
        }

        getCurrentPlayTime()
          .then((currentTime) => {
            if (currentTime === null) return;

            const currentTimeMs = currentTime * 1000;
            let foundIndex = -1;

            for (let i = 0; i < parsedLyrics.value.length; i++) {
              if (parsedLyrics.value[i].time <= currentTimeMs) {
                foundIndex = i;
              } else {
                break;
              }
            }

            if (foundIndex !== -1 && foundIndex !== currentLyricIndex.value) {
              currentLyricIndex.value = foundIndex;
              updateVisibleLyrics();
              scrollToCurrentLyric();
            }
          })
          .catch((err) => {
            console.error("获取播放时间失败:", err);
          });
      }, 100);
    };

    const updateVisibleLyrics = () => {
      const start = Math.max(0, currentLyricIndex.value - 2);
      const end = Math.min(
        parsedLyrics.value.length,
        currentLyricIndex.value + 4
      );

      visibleLyrics.value = parsedLyrics.value.slice(start, end);

      currentVisibleIndex.value = currentLyricIndex.value - start;
    };

    const getCurrentPlayTime = async () => {
      try {
        // 这里假设歌曲一开始播放，模拟时间增长
        const sinkEmpty = await invoke("is_sink_empty");
        if (sinkEmpty) {
          return 0;
        }

        const startTime = musicState.state.globalMusic.startTime || Date.now();
        const pausedTime = musicState.state.globalMusic.pausedTime || 0;

        if (!musicState.state.globalMusic.isPlaying) {
          return pausedTime / 1000;
        }

        const currentTime = Date.now() - startTime + pausedTime;
        return currentTime / 1000;
      } catch (error) {
        console.error("获取播放时间失败:", error);
        return null;
      }
    };

    const scrollToCurrentLyric = () => {
      if (!lyricsWrapper.value) return;

      const currentLine = lyricLineRefs.value[currentVisibleIndex.value];
      if (!currentLine) return;

      const containerHeight = lyricsWrapper.value.clientHeight;
      const lineTop = currentLine.offsetTop;
      const lineHeight = currentLine.clientHeight;

      const scrollPosition = lineTop - containerHeight / 2 + lineHeight / 2;

      lyricsWrapper.value.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
    };

    const checkSongStatus = async () => {
      try {
        // 只有网易云音乐在播放且有当前歌曲时才检查
        if (
          musicState.state.globalMusic.currentSource === "netease" &&
          musicState.state.neteaseMusic.isPlaying &&
          musicState.state.neteaseMusic.currentSong
        ) {
          const isEmpty = await invoke("is_sink_empty");

          // 如果音频播放器已经空了，但状态还是播放中，说明歌曲播放完毕
          if (isEmpty && musicState.state.neteaseMusic.isPlaying) {
            console.log("当前歌曲播放完毕，准备播放下一首");

            // 如果有下一首歌，则自动播放下一首
            if (hasNext.value) {
              playNext();
            } else {
              console.log("已经是最后一首歌曲，不再自动播放");
            }
          }
        }
      } catch (error) {
        console.error("检查歌曲状态出错:", error);
      }
    };

    watch(
      () => musicState.state.neteaseMusic.currentSong,
      (newSong) => {
        if (isImmersiveMode.value && newSong) {
          fetchLyrics(newSong);
          startLyricScroll();
        }
      }
    );

    watch(
      () => musicState.state.neteaseMusic.isPlaying,
      (isPlaying) => {
        if (isImmersiveMode.value) {
          if (isPlaying) {
            startLyricScroll();
          } else {
            clearInterval(lyricTimer.value);
            lyricTimer.value = null;
          }
        }
      }
    );

    const playPrevious = () => {
      const currentIndex =
        musicState.state.neteaseMusic.searchResults.findIndex(
          (song) => song.id === musicState.state.neteaseMusic.currentSong.id
        );
      if (currentIndex > 0) {
        playSong(musicState.state.neteaseMusic.searchResults[currentIndex - 1]);
      }
    };

    const playNext = () => {
      const currentIndex =
        musicState.state.neteaseMusic.searchResults.findIndex(
          (song) => song.id === musicState.state.neteaseMusic.currentSong.id
        );
      if (
        currentIndex <
        musicState.state.neteaseMusic.searchResults.length - 1
      ) {
        playSong(musicState.state.neteaseMusic.searchResults[currentIndex + 1]);
      }
    };

    const hasPrevious = computed(() => {
      const currentIndex =
        musicState.state.neteaseMusic.searchResults.findIndex(
          (song) => song.id === musicState.state.neteaseMusic.currentSong.id
        );
      return currentIndex > 0;
    });

    const hasNext = computed(() => {
      const currentIndex =
        musicState.state.neteaseMusic.searchResults.findIndex(
          (song) => song.id === musicState.state.neteaseMusic.currentSong.id
        );
      return (
        currentIndex < musicState.state.neteaseMusic.searchResults.length - 1
      );
    });

    onBeforeUnmount(() => {
      console.log("Keep alive NeteaseView");
      // 清除所有定时器
      if (lyricTimer.value) {
        clearInterval(lyricTimer.value);
        lyricTimer.value = null;
      }
      if (lyricFetchTimeout.value) {
        clearTimeout(lyricFetchTimeout.value);
        lyricFetchTimeout.value = null;
      }
      // 清除自动播放检查定时器
      if (autoPlayCheckInterval.value) {
        clearInterval(autoPlayCheckInterval.value);
        autoPlayCheckInterval.value = null;
      }
    });

    onMounted(() => {
      // 初始化搜索和播放状态
      if (musicState.state.neteaseMusic.searchKeyword) {
        searchKeyword.value = musicState.state.neteaseMusic.searchKeyword;
        searchSongs();
      }

      if (
        musicState.state.globalMusic.currentSource === "netease" &&
        musicState.state.globalMusic.isPlaying
      ) {
        musicState.mutations.setNeteasePlaying(true);
        if (parsedLyrics.value.length > 0) {
          updateVisibleLyrics();
        }
      }

      // 启动自动播放检查定时器，每秒检查一次
      autoPlayCheckInterval.value = setInterval(checkSongStatus, 1000);
    });

    return {
      searchKeyword,
      musicState,
      searchSongs,
      playSong,
      togglePlay,
      changePage,
      formatDuration,
      formatTime,
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
      parsedLyrics,
      visibleLyrics,
      currentLyricIndex,
      currentVisibleIndex,
      lyricsWrapper,
      lyricLineRefs,
      playPrevious,
      playNext,
      hasPrevious,
      hasNext,
      originalTitle,
      currentTime,
      totalDuration,
      progressPercentage,
      updateVisibleLyrics,
      checkSongStatus,
    };
  },
};
</script>

<style scoped>
@import "../css/Netease.css";
</style>
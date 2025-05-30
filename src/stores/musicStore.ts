import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import type { MusicFile, SongInfo, SearchResult, PlaySongResult } from '../types/model'
import { ViewMode } from '../types/model'

export const useMusicStore = defineStore('music', () => {
  // 主题设置
  const isDarkMode = ref(false)
  
  // 视图模式（本地/在线）
  const viewMode = ref<ViewMode>(ViewMode.LOCAL)
  
  // 本地音乐相关
  const musicFiles = ref<MusicFile[]>([])
  const currentDirectory = ref("")
  const currentMusic = ref<MusicFile | null>(null)
  
  // 在线音乐相关
  const onlineSongs = ref<SongInfo[]>([])
  const onlineSongsTotal = ref(0)
  const isSearchLoading = ref(false)
  const searchKeyword = ref("")
  const currentPage = ref(1)
  const pageSize = ref(20)
  const currentOnlineSong = ref<SongInfo | null>(null)
  
  // 播放相关
  const isPlaying = ref(false)
  const showImmersiveMode = ref(false)
  const playQueueId = ref(0)
  const isProcessingPlayRequest = ref(false)
  const currentPlayTime = ref(0)
  
  // 播放时间跟踪
  let playStartTimestamp = 0
  let playTimeUpdateInterval: number | null = null
  
  // 计算属性
  const hasCurrentTrack = computed(() => 
    currentMusic.value !== null || currentOnlineSong.value !== null
  )
  
  const currentTrackInfo = computed(() => {
    if (viewMode.value === ViewMode.LOCAL && currentMusic.value) {
      return {
        name: currentMusic.value.file_name,
        artist: '',
        picUrl: ''
      }
    } else if (viewMode.value === ViewMode.ONLINE && currentOnlineSong.value) {
      return {
        name: currentOnlineSong.value.name,
        artist: currentOnlineSong.value.artists.join(', '),
        picUrl: currentOnlineSong.value.pic_url || ''
      }
    }
    return null
  })
  
  // 加载音乐文件
  async function loadMusicFiles(path: string) {
    try {
      currentDirectory.value = path
      musicFiles.value = await invoke("scan_files", { path })
    } catch (error) {
      console.error("加载音乐文件失败:", error)
      ElMessage.error(`加载音乐文件失败: ${error}`)
    }
  }
  
  // 选择文件夹
  async function selectDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择音乐文件夹",
      })

      if (selected && typeof selected === "string") {
        await loadMusicFiles(selected)
      }
    } catch (error) {
      console.error("选择文件夹失败:", error)
      ElMessage.error(`选择文件夹失败: ${error}`)
    }
  }
  
  // 开始跟踪播放时间
  function startPlayTimeTracking() {
    stopPlayTimeTracking()
    const startOffset = currentPlayTime.value
    playStartTimestamp = Date.now() - startOffset
    playTimeUpdateInterval = window.setInterval(() => {
      currentPlayTime.value = Date.now() - playStartTimestamp
    }, 200)
  }
  
  // 停止跟踪播放时间
  function stopPlayTimeTracking() {
    if (playTimeUpdateInterval !== null) {
      if (isPlaying.value && playStartTimestamp !== 0) {
        currentPlayTime.value = Date.now() - playStartTimestamp
      }
      clearInterval(playTimeUpdateInterval)
      playTimeUpdateInterval = null
    }
  }
  
  // 播放本地音乐
  async function playMusic(music: MusicFile) {
    try {
      isPlaying.value = false
      currentPlayTime.value = 0
      stopPlayTimeTracking()

      currentMusic.value = music
      currentOnlineSong.value = null

      const fullPath = `${currentDirectory.value}/${music.file_name}`

      await invoke("handle_event", {
        event: JSON.stringify({
          action: "play",
          path: fullPath,
        }),
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      isPlaying.value = true
      startPlayTimeTracking()

      ElMessage.success(`正在播放: ${music.file_name}`)
    } catch (error) {
      console.error("播放音乐失败:", error)
      ElMessage.error(`播放音乐失败: ${error}`)
    }
  }
  
  // 播放在线音乐
  async function playOnlineSong(song: SongInfo) {
    try {
      isPlaying.value = false
      currentPlayTime.value = 0
      stopPlayTimeTracking()

      playQueueId.value++
      const currentQueueId = playQueueId.value

      currentOnlineSong.value = song
      currentMusic.value = null

      if (isProcessingPlayRequest.value) {
        console.log(`[队列] 已加入队列，ID: ${currentQueueId}，歌曲: ${song.name}`)
        return
      }

      isProcessingPlayRequest.value = true
      console.log(`[队列] 开始处理播放请求`)

      try {
        while (true) {
          const songToPlay = currentOnlineSong.value
          const queueIdAtStart = playQueueId.value

          console.log(`[队列] 开始处理，ID: ${queueIdAtStart}，歌曲: ${songToPlay.name}`)

          const songResult = await invoke<PlaySongResult>("play_netease_song", {
            id: songToPlay.file_hash,
            name: songToPlay.name,
            artist: songToPlay.artists.join(", "),
          })

          if (queueIdAtStart !== playQueueId.value) {
            console.log(`[队列] 检测到新请求，中止当前处理。原ID: ${queueIdAtStart}，新ID: ${playQueueId.value}`)
            continue
          }

          if (!songResult || !songResult.url) {
            throw new Error("获取播放URL失败")
          }

          if (songResult.pic_url && currentOnlineSong.value) {
            currentOnlineSong.value.pic_url = songResult.pic_url
          }

          await new Promise((resolve) => setTimeout(resolve, 2000))

          if (queueIdAtStart !== playQueueId.value) {
            console.log(`[队列] 加载后检测到新请求，中止播放。原ID: ${queueIdAtStart}，新ID: ${playQueueId.value}`)
            continue
          }

          await invoke("handle_event", {
            event: JSON.stringify({
              action: "play",
              path: songResult.url,
            }),
          })
          
          isPlaying.value = true
          startPlayTimeTracking()

          ElMessage.success(`正在播放: ${songToPlay.name} - ${songToPlay.artists.join(", ")}`)
          break
        }
      } finally {
        isProcessingPlayRequest.value = false
        console.log(`[队列] 播放请求处理完成`)
      }
    } catch (error) {
      console.error("播放在线音乐失败:", error)
      isPlaying.value = false
      ElMessage.error(`播放在线音乐失败: ${error}`)
    }
  }
  
  // 下载在线音乐
  async function downloadOnlineSong(song: SongInfo) {
    try {
      ElMessage.info("开始下载歌曲，请稍候...")

      const fileName = await invoke("download_music", {
        songHash: song.file_hash,
        songName: song.name,
        artist: song.artists.join(", "),
      })

      ElMessage.success(`歌曲已下载: ${fileName}`)

      if (viewMode.value === ViewMode.LOCAL && currentDirectory.value) {
        await loadMusicFiles(currentDirectory.value)
      }
    } catch (error) {
      console.error("下载歌曲失败:", error)
      ElMessage.error(`下载歌曲失败: ${error}`)
    }
  }
  
  // 播放下一首或上一首音乐
  async function playNextOrPreviousMusic(step: number) {
    if (viewMode.value === ViewMode.LOCAL) {
      if (musicFiles.value.length === 0) {
        ElMessage.warning("没有可播放的本地音乐")
        return
      }

      let currentIndex = musicFiles.value.findIndex(
        (file) => file.id === currentMusic.value?.id
      )

      if (currentIndex === -1) {
        currentIndex = 0
      }

      let nextIndex = (currentIndex + step) % musicFiles.value.length
      if (nextIndex < 0) {
        nextIndex = musicFiles.value.length + nextIndex
      }

      await playMusic(musicFiles.value[nextIndex])
    } else {
      if (onlineSongs.value.length === 0) {
        ElMessage.warning("没有可播放的在线音乐")
        return
      }

      let currentIndex = onlineSongs.value.findIndex(
        (song) => song.id === currentOnlineSong.value?.id
      )

      if (currentIndex === -1) {
        currentIndex = 0
      }

      let nextIndex = (currentIndex + step) % onlineSongs.value.length
      if (nextIndex < 0) {
        nextIndex = onlineSongs.value.length + nextIndex
      }

      console.log(`[播放控制] 播放${step > 0 ? "下" : "上"}一首，当前索引: ${currentIndex}，目标索引: ${nextIndex}`)
      playOnlineSong(onlineSongs.value[nextIndex])
    }
  }
  
  // 暂停/恢复播放
  async function togglePlay() {
    if (isPlaying.value) {
      await invoke("handle_event", {
        event: JSON.stringify({
          action: "pause",
        }),
      })
      stopPlayTimeTracking()
    } else {
      await invoke("handle_event", {
        event: JSON.stringify({
          action: "recovery",
        }),
      })
      startPlayTimeTracking()
    }
    isPlaying.value = !isPlaying.value
  }
  
  // 调整音量
  async function adjustVolume(volume: number) {
    await invoke("handle_event", {
      event: JSON.stringify({
        action: "volume",
        volume,
      }),
    })
  }
  
  // 刷新当前目录
  async function refreshCurrentDirectory() {
    if (currentDirectory.value) {
      await loadMusicFiles(currentDirectory.value)
    }
  }
  
  // 在线搜索音乐
  async function searchOnlineMusic(keyword: string, page = 1) {
    try {
      if (page === 1) {
        onlineSongs.value = []
        onlineSongsTotal.value = 0
      }

      searchKeyword.value = keyword
      currentPage.value = page
      isSearchLoading.value = true

      const result = await invoke<SearchResult>("search_songs", {
        keywords: keyword,
        page,
        pagesize: pageSize.value,
      })

      if (page === 1) {
        onlineSongs.value = result.songs
      } else {
        onlineSongs.value = [...onlineSongs.value, ...result.songs]
      }

      onlineSongsTotal.value = result.total

      if (result.songs.length === 0 && page === 1) {
        ElMessage.info("未找到相关歌曲")
      }
    } catch (error) {
      console.error("在线搜索失败:", error)
      ElMessage.error(`在线搜索失败: ${error}`)
    } finally {
      isSearchLoading.value = false
    }
  }
  
  // 本地搜索音乐
  function searchLocalMusic(keyword: string) {
    if (!keyword.trim()) {
      refreshCurrentDirectory()
      return
    }
    
    const filteredFiles = musicFiles.value.filter((file) =>
      file.file_name.toLowerCase().includes(keyword.toLowerCase())
    )
    musicFiles.value = filteredFiles
    
    if (filteredFiles.length === 0) {
      ElMessage.info("未找到相关歌曲")
    } else {
      ElMessage.success(`找到 ${filteredFiles.length} 首相关歌曲`)
    }
  }
  
  // 加载更多在线音乐
  function loadMoreResults() {
    if (searchKeyword.value) {
      searchOnlineMusic(searchKeyword.value, currentPage.value + 1)
    }
  }
  
  // 切换视图模式
  function switchViewMode(mode: ViewMode) {
    viewMode.value = mode
    
    if (mode === ViewMode.ONLINE) {
      onlineSongs.value = []
      onlineSongsTotal.value = 0
    } else if (mode === ViewMode.LOCAL && currentDirectory.value) {
      refreshCurrentDirectory()
    }
  }
  
  // 主题相关
  function setThemeByTime() {
    const now = new Date()
    const hours = now.getHours()
    const shouldBeDark = hours < 8 || hours >= 18

    if (isDarkMode.value !== shouldBeDark) {
      isDarkMode.value = shouldBeDark
      applyTheme()
    }
  }
  
  function applyTheme() {
    if (isDarkMode.value) {
      document.documentElement.classList.add("dark")
      document.body.setAttribute("data-theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      document.body.setAttribute("data-theme", "light")
    }
  }
  
  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
    applyTheme()
  }
  
  // 沉浸模式
  function showImmersive() {
    if (currentOnlineSong.value || currentMusic.value) {
      if (isPlaying.value && playTimeUpdateInterval === null) {
        startPlayTimeTracking()
      }
      showImmersiveMode.value = true
    }
  }
  
  function exitImmersive() {
    showImmersiveMode.value = false
  }
  
  // 初始化
  async function initialize() {
    try {
      const defaultDir = await invoke("get_default_music_dir")
      if (defaultDir) {
        await loadMusicFiles(defaultDir as string)
      }
    } catch (error) {
      console.error("加载默认目录失败:", error)
    }
    
    setThemeByTime()
    applyTheme()
  }
  
  return {
    // 状态
    isDarkMode,
    viewMode,
    musicFiles,
    currentDirectory,
    currentMusic,
    onlineSongs,
    onlineSongsTotal,
    isSearchLoading,
    searchKeyword,
    currentPage,
    pageSize,
    currentOnlineSong,
    isPlaying,
    showImmersiveMode,
    currentPlayTime,
    
    // 计算属性
    hasCurrentTrack,
    currentTrackInfo,
    
    // 方法
    loadMusicFiles,
    selectDirectory,
    playMusic,
    playOnlineSong,
    downloadOnlineSong,
    playNextOrPreviousMusic,
    togglePlay,
    adjustVolume,
    refreshCurrentDirectory,
    searchOnlineMusic,
    searchLocalMusic,
    loadMoreResults,
    switchViewMode,
    toggleTheme,
    showImmersive,
    exitImmersive,
    initialize,
    startPlayTimeTracking,
    stopPlayTimeTracking
  }
})

import { reactive, readonly } from "vue";

const state = reactive({
  localMusic: {
    musicPath: "", // 选择的音乐文件夹路径
    musicFiles: [], // 扫描到的音乐文件列表
    currentMusic: null, // 当前播放的音乐
    isPlaying: false, // 是否正在播放
    volume: 50, // 音量
  },
  neteaseMusic: {
    searchKeyword: "", // 搜索关键词
    searchResults: [], // 搜索结果
    currentPage: 1, // 当前页码
    pageSize: 20, // 每页显示数量
    totalCount: 0, // 搜索结果总数
    currentSong: null, // 当前播放的歌曲
    isPlaying: false, // 是否正在播放
    loading: false, // 是否正在加载
  }
});

const mutations = {
  // 本地音乐相关操作
  setMusicPath(path) {
    state.localMusic.musicPath = path;
  },

  setMusicFiles(files) {
    state.localMusic.musicFiles = files;
  },

  setCurrentMusic(music) {
    state.localMusic.currentMusic = music;
  },

  setLocalMusicPlaying(isPlaying) {
    state.localMusic.isPlaying = isPlaying;
  },

  setLocalMusicVolume(volume) {
    state.localMusic.volume = volume;
  },

  // 网易云音乐相关操作
  setNeteaseSearchKeyword(keyword) {
    state.neteaseMusic.searchKeyword = keyword;
  },

  setNeteaseSearchResults(results) {
    state.neteaseMusic.searchResults = results;
  },

  setNeteaseTotalCount(count) {
    state.neteaseMusic.totalCount = count;
  },

  setNeteaseCurrentPage(page) {
    state.neteaseMusic.currentPage = page;
  },

  setNeteaseCurrentSong(song) {
    state.neteaseMusic.currentSong = song;
  },

  setNeteasePlaying(isPlaying) {
    state.neteaseMusic.isPlaying = isPlaying;
  },

  setNeteaseLoading(loading) {
    state.neteaseMusic.loading = loading;
  }
};

export default {
  state: readonly(state),
  mutations,
};

import { reactive, readonly } from "vue";

const state = reactive({
  localMusic: {
    musicPath: "", // 选择的音乐文件夹路径
    musicFiles: [], // 扫描到的音乐文件列表
    currentMusic: null, // 当前播放的音乐
    isPlaying: false, // 是否正在播放
    volume: 50, // 音量
  },
});

const mutations = {
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
};

export default {
  state: readonly(state),
  mutations,
};

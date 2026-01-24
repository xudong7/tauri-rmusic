<template>
  <div class="local-music-view">
    <MusicList
      :musicFiles="musicStore.musicFiles"
      :currentMusic="musicStore.currentMusic"
      :isPlaying="musicStore.isPlaying"
      @play="musicStore.playMusic"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useMusicStore } from "@/stores/musicStore";
import MusicList from "@/components/MusicList/MusicList.vue";
import { ViewMode } from "@/types/model";

const musicStore = useMusicStore();

onMounted(() => {
  // 当进入本地音乐页面时，设置视图模式为本地
  musicStore.switchViewMode(ViewMode.LOCAL);
});
</script>

<style scoped>
.local-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

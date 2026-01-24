<template>
  <div class="online-music-view">
    <OnlineMusicList
      :onlineSongs="musicStore.onlineSongs"
      :currentSong="musicStore.currentOnlineSong"
      :isPlaying="musicStore.isPlaying"
      :loading="musicStore.isSearchLoading"
      :totalCount="musicStore.onlineSongsTotal"
      @play="musicStore.playOnlineSong"
      @download="musicStore.downloadOnlineSong"
      @load-more="musicStore.loadMoreResults"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useMusicStore } from "@/stores/musicStore";
import OnlineMusicList from "@/components/OnlineMusicList/OnlineMusicList.vue";
import { ViewMode } from "@/types/model";

const musicStore = useMusicStore();

onMounted(() => {
  // 当进入在线音乐页面时，设置视图模式为在线
  musicStore.switchViewMode(ViewMode.ONLINE);
});
</script>

<style scoped>
.online-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

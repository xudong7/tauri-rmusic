<template>
  <div class="online-music-view">
    <OnlineMusicList
      :onlineSongs="onlineStore.onlineSongs"
      :onlineArtists="onlineStore.onlineArtists"
      :currentSong="playerStore.currentOnlineSong"
      :isPlaying="playerStore.isPlaying"
      :loading="onlineStore.isSearchLoading"
      :totalCount="onlineStore.onlineSongsTotal"
      @play="playOnlineSongFromSearch"
      @download="downloadOnlineSong"
      @load-more="onlineStore.loadMoreResults"
      @add-to-playlist="addOnlineSongToPlaylist"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useOnlineMusicStore } from "@/stores/onlineMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import OnlineMusicList from "@/components/feature/OnlineMusicList/OnlineMusicList.vue";
import { ViewMode } from "@/types/model";
import { useOnlinePlaylistActions } from "@/composables/useOnlinePlaylistActions";
import type { SongInfo } from "@/types/model";

const onlineStore = useOnlineMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();
const { downloadOnlineSong, addOnlineSongToPlaylist } = useOnlinePlaylistActions();

function playOnlineSongFromSearch(song: SongInfo) {
  void playerStore.playOnlineSong(song, { queue: onlineStore.onlineSongs });
}

onMounted(() => {
  // 进入在线音乐页面时设置视图模式；不重置搜索结果，切换本地/设置再回来仍保留上次搜索
  viewStore.setViewMode(ViewMode.ONLINE);
  viewStore.setLastOnlinePath("/online");
});
</script>

<style scoped>
.online-music-view {
  height: 100%;
  overflow: hidden;
}
</style>

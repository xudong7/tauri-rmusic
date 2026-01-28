<template>
  <div class="artist-view">
    <div class="artist-header" v-if="musicStore.currentArtist">
      <img
        v-if="musicStore.currentArtist.pic_url"
        :src="musicStore.currentArtist.pic_url"
        class="artist-avatar"
        alt=""
      />
      <div v-else class="artist-avatar placeholder"></div>
      <div class="artist-name" :title="musicStore.currentArtist.name">
        {{ musicStore.currentArtist.name }}
      </div>
    </div>

    <OnlineMusicList
      :onlineSongs="musicStore.artistSongs"
      :onlineArtists="[]"
      :currentSong="musicStore.currentOnlineSong"
      :isPlaying="musicStore.isPlaying"
      :loading="musicStore.isArtistLoading"
      :totalCount="musicStore.artistSongsTotal"
      :showTitle="false"
      @play="musicStore.playOnlineSong"
      @download="musicStore.downloadOnlineSong"
      @load-more="musicStore.loadMoreArtistSongs"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useMusicStore } from "@/stores/musicStore";
import OnlineMusicList from "@/components/OnlineMusicList/OnlineMusicList.vue";
import { ViewMode } from "@/types/model";

const route = useRoute();
const musicStore = useMusicStore();

function getQueryString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
}

function load() {
  const id = String(route.params.id || "");
  if (!id) return;

  // 优先使用路由携带的歌手信息渲染头部（搜索结果点击进来会带上）
  const name = getQueryString(route.query.name);
  const pic_url = getQueryString(route.query.pic_url);
  if (name || pic_url) {
    musicStore.currentArtist = {
      id,
      name: name || musicStore.currentArtist?.name || "Artist",
      pic_url: pic_url || musicStore.currentArtist?.pic_url || "",
    };
  }

  // 进入歌手页也属于在线模式
  musicStore.switchViewMode(ViewMode.ONLINE);
  musicStore.loadArtistSongs(id);
}

onMounted(load);
watch(() => route.params.id, load);
watch(() => route.query, load);
</script>

<style scoped>
.artist-view {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.artist-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 8px 14px;
  flex-shrink: 0;
}

.artist-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--el-fill-color);
}

.artist-avatar.placeholder {
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
}

.artist-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

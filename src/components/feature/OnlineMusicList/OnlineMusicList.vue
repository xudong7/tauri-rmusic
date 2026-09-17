<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Plus } from "@element-plus/icons-vue";
import type { SongInfo } from "@/types/model";
import { formatDuration, formatArtists } from "@/utils/songUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

const { t } = useI18n();
const playlistStore = usePlaylistStore();

const props = withDefaults(
  defineProps<{
    onlineSongs: SongInfo[];
    currentSong: SongInfo | null;
    isPlaying: boolean;
    loading: boolean;
    totalCount: number;
    /**
     * 是否还有下一页。显式传入时以它为准——部分接口（如歌手歌曲、
     * 歌单曲目）不返回可用的总数，此时 totalCount 为 0，
     * 沿用 `length >= totalCount` 会导致 load-more 永不触发。
     */
    hasMore?: boolean;
  }>(),
  {
    hasMore: undefined,
  }
);

const emit = defineEmits([
  "play",
  "toggle-current",
  "download",
  "load-more",
  "add-to-playlist",
]);

function requestLoadMore() {
  if (props.loading) return;
  if (props.hasMore !== undefined) {
    if (!props.hasMore) return;
  } else if (props.onlineSongs.length >= props.totalCount) {
    return;
  }
  emit("load-more");
}

const currentKey = computed(() => props.currentSong?.id ?? null);

function toTrackRow(song: SongInfo, sourceIndex: number): TrackRowModel {
  return {
    key: song.id,
    title: song.name,
    artist: formatArtists(song.artists),
    album: song.album || undefined,
    durationLabel: formatDuration(song.duration),
    coverUrl: song.pic_url,
    source: "online",
    sourceIndex,
  };
}

const trackRows = computed(() => props.onlineSongs.map(toTrackRow));

function handleAddToPlaylist(command: string, row: SongInfo) {
  emit("add-to-playlist", command, row);
}
</script>

<template>
  <div class="online-music-list-container">
    <TrackList
      :items="trackRows"
      :loading="loading"
      :current-key="currentKey"
      :is-playing="props.isPlaying"
      @activate="emit('play', onlineSongs[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @near-end="requestLoadMore"
    >
      <!-- 透传父组件的同名插槽，未提供时回退到通用文案。
           歌单/专辑/歌手页各自传入了更准确的空状态（如「歌单不存在或已被删除」），
           不透传的话这些提示会被这里的内容静默取代。 -->
      <template #loading>
        <slot name="loading">
          <el-skeleton :rows="5" animated />
        </slot>
      </template>
      <template #empty>
        <slot name="empty">
          <el-empty :description="t('onlineMusic.empty')" />
        </slot>
      </template>
      <template #actions="{ item }">
        <el-tooltip :content="t('common.download')" placement="top">
          <el-button
            circle
            size="small"
            :icon="Download"
            link
            :aria-label="t('common.download')"
            @click="emit('download', onlineSongs[item.sourceIndex])"
          />
        </el-tooltip>
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => handleAddToPlaylist(cmd, onlineSongs[item.sourceIndex])
          "
        >
          <el-tooltip :content="t('playlist.addToPlaylist')" placement="top">
            <el-button
              circle
              size="small"
              :icon="Plus"
              link
              :aria-label="t('playlist.addToPlaylist')"
            />
          </el-tooltip>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="new">{{
                t("playlist.newPlaylist")
              }}</el-dropdown-item>
              <el-dropdown-item
                v-for="pl in playlistStore.playlists"
                :key="pl.id"
                :command="pl.id"
              >
                {{ pl.name || t("playlist.unnamed") }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </TrackList>
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

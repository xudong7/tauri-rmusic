<template>
  <div class="playlist-view">
    <div v-if="!playlist" class="playlist-empty">
      <el-empty :description="t('playlist.notFound')" />
    </div>
    <template v-else>
      <div class="list-header">
        <div class="header-left">
          <h2 class="list-title">{{ displayName }}</h2>
          <el-tooltip v-if="!editingName" :content="t('playlist.rename')" placement="top">
            <el-button
              link
              size="small"
              :icon="EditPen"
              type="primary"
              class="header-action-btn"
              @click="editingName = true"
            />
          </el-tooltip>
          <el-input
            v-else
            ref="nameInputRef"
            v-model="editNameValue"
            size="small"
            class="name-input"
            maxlength="50"
            show-word-limit
            @blur="submitRename"
            @keydown.enter="submitRename"
          />
        </div>
        <div class="header-actions">
          <el-popconfirm
            :title="t('playlist.deleteConfirm')"
            :confirm-button-text="t('common.confirmDelete')"
            :cancel-button-text="t('common.cancel')"
            width="320"
            @confirm="confirmDelete"
          >
            <template #reference>
              <el-tooltip :content="t('playlist.delete')" placement="top">
                <el-button
                  link
                  size="small"
                  :icon="Minus"
                  type="default"
                  class="header-action-btn"
                />
              </el-tooltip>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <div v-if="resolvedItems.length === 0" class="empty-list">
        <el-empty :description="t('playlist.empty')" />
      </div>

      <el-scrollbar v-else class="list-scroll">
        <div class="list-rows">
          <div
            v-for="(entry, index) in displayItems"
            :key="entry.key"
            class="list-row"
            :class="{ 'is-current': isCurrent(entry) }"
            @dblclick="playAt(index)"
          >
            <div class="col-play">
              <el-button
                circle
                size="small"
                :type="isCurrent(entry) ? 'primary' : 'default'"
                :icon="
                  isCurrent(entry) && playerStore.isPlaying ? VideoPause : CaretRight
                "
                @click="playAt(index)"
              />
            </div>
            <div class="col-cover">
              <img v-if="entry.coverUrl" :src="entry.coverUrl" class="cover-img" alt="" />
              <div v-else class="cover-placeholder">
                <el-icon><Headset /></el-icon>
              </div>
            </div>
            <div class="col-main">
              <div class="song-title" :class="{ 'is-playing': isCurrent(entry) }">
                {{ entry.title }}
              </div>
              <div class="song-artist">{{ entry.artist }}</div>
            </div>
            <div class="col-actions">
              <el-button
                circle
                size="small"
                :icon="Minus"
                link
                type="default"
                @click.stop="removeAt(index)"
              />
            </div>
          </div>
        </div>
      </el-scrollbar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  CaretRight,
  VideoPause,
  Headset,
  Minus,
  EditPen,
} from "@element-plus/icons-vue";
import type { PlaylistItem, MusicFile, SongInfo } from "@/types/model";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { loadLocalCover } from "@/utils/coverUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import { ViewMode } from "@/types/model";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const playlistStore = usePlaylistStore();
const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();
const viewStore = useViewStore();

const editingName = ref(false);
const editNameValue = ref("");
const nameInputRef = ref<InstanceType<typeof import("element-plus").ElInput> | null>(
  null
);

const playlistId = computed(() => route.params.id as string);
const playlist = computed(() =>
  playlistId.value && playlistId.value !== "new"
    ? playlistStore.getPlaylist(playlistId.value)
    : undefined
);

const displayName = computed(() => playlist.value?.name ?? t("playlist.unnamed"));

watch(
  () => playlist.value?.name,
  (name) => {
    editNameValue.value = name ?? "";
  },
  { immediate: true }
);

function submitRename() {
  if (!playlist.value) return;
  const name = editNameValue.value.trim();
  if (name) {
    playlistStore.renamePlaylist(playlist.value.id, name);
  }
  editingName.value = false;
}

function confirmDelete() {
  if (!playlist.value) return;
  playlistStore.deletePlaylist(playlist.value.id);
  router.push("/");
}

interface ResolvedEntry {
  key: string;
  title: string;
  artist: string;
  coverUrl: string;
  item: PlaylistItem;
  musicFile: MusicFile | null;
  songInfo: SongInfo | null;
}

const resolvedItems = computed(() => {
  const list = playlist.value;
  if (!list) return [];
  const result: ResolvedEntry[] = [];
  for (let i = 0; i < list.items.length; i++) {
    const item = list.items[i];
    if (item.type === "local") {
      const file = localStore.musicFiles.find((f) => f.file_name === item.file_name);
      const display = getDisplayName(item.file_name);
      result.push({
        key: `local_${i}_${item.file_name}`,
        title: extractSongTitle(display) || display,
        artist: extractArtistName(display) || t("common.unknownArtist"),
        coverUrl: "", // 下面用 reactive 或单独加载
        item,
        musicFile: file ?? null,
        songInfo: null,
      });
    } else {
      const s = item.song;
      result.push({
        key: `online_${i}_${s.id}`,
        title: s.name,
        artist: s.artists?.join(", ") ?? t("common.unknownArtist"),
        coverUrl: s.pic_url ?? "",
        item,
        musicFile: null,
        songInfo: s,
      });
    }
  }
  return result;
});

// 为本地项异步加载封面
const coverByKey = ref<Record<string, string>>({});
watch(
  resolvedItems,
  (items) => {
    items.forEach((entry) => {
      if (
        entry.item.type === "local" &&
        entry.musicFile &&
        !coverByKey.value[entry.key]
      ) {
        loadLocalCover(entry.item.file_name, () => localStore.getDefaultDirectory()).then(
          (url) => {
            coverByKey.value[entry.key] = url ?? "";
          }
        );
      }
    });
  },
  { immediate: true, deep: true }
);

const displayItems = computed(() =>
  resolvedItems.value.map((e) => ({
    ...e,
    coverUrl: e.item.type === "online" ? e.coverUrl : (coverByKey.value[e.key] ?? ""),
  }))
);

function isCurrent(entry: ResolvedEntry & { coverUrl?: string }) {
  if (entry.musicFile && playerStore.currentMusic)
    return playerStore.currentMusic.file_name === entry.musicFile.file_name;
  if (entry.songInfo && playerStore.currentOnlineSong)
    return playerStore.currentOnlineSong.id === entry.songInfo.id;
  return false;
}

function playAt(index: number) {
  const list = playlist.value;
  if (!list) return;
  playerStore.playFromPlaylist(list.id, index);
}

function removeAt(index: number) {
  if (!playlist.value) return;
  playlistStore.removeFromPlaylist(playlist.value.id, index);
}

// 进入页面时设置视图模式
watch(
  playlistId,
  (id) => {
    if (id && id !== "new") viewStore.setViewMode(ViewMode.PLAYLIST);
  },
  { immediate: true }
);

watch(editingName, (v) => {
  if (v) nextTick(() => nameInputRef.value?.focus());
});
</script>

<style scoped>
.playlist-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--app-spacing);
  min-height: 44px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.list-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  padding-left: 14px;
  position: relative;
  flex-shrink: 0;
}

.list-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 60%;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.name-input {
  width: 200px;
}

.header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 播放列表标题旁的重命名/删除：无边框 link 图标 */
.header-action-btn {
  padding: 4px 6px;
}

.empty-list,
.playlist-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 200px;
}

.list-scroll {
  flex: 1;
  min-height: 0;
}

.list-rows {
  padding: 0 4px 12px;
}

.list-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  margin-bottom: 4px;
  border-radius: var(--app-radius-md);
  cursor: pointer;
  min-height: 60px;
  box-sizing: border-box;
  transition: background 0.2s ease;
}

.list-row:hover {
  background: var(--hover-bg-color);
}

.list-row.is-current {
  background: var(--active-item-bg);
}

.list-row.is-current::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--el-color-primary);
  border-radius: 0 2px 2px 0;
}

.col-play,
.col-cover,
.col-actions {
  flex-shrink: 0;
}

.col-main {
  flex: 1;
  min-width: 0;
}

.cover-img {
  width: 40px;
  height: 40px;
  border-radius: var(--app-radius-sm);
  object-fit: cover;
}

.cover-placeholder {
  width: 40px;
  height: 40px;
  border-radius: var(--app-radius-sm);
  background: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}

.song-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-title.is-playing {
  color: var(--el-color-primary);
  font-weight: 600;
}

.song-artist {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

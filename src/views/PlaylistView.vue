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
          <template v-if="selectionMode">
            <span class="select-actions">
              <el-button link size="small" @click="selectAll">{{
                t("musicList.selectAll")
              }}</el-button>
              <el-button link size="small" @click="deselectAll">{{
                t("musicList.deselectAll")
              }}</el-button>
              <el-button link size="small" @click="toggleSelectionMode">{{
                t("musicList.cancelSelect")
              }}</el-button>
            </span>
            <el-button
              v-if="selectedIndices.size > 0"
              type="primary"
              size="small"
              class="batch-remove-btn"
              @click="removeSelectedFromPlaylist"
            >
              {{ t("playlist.removeSelected") }} ({{ selectedIndices.size }})
            </el-button>
          </template>
          <template v-else>
            <el-tooltip :content="t('musicList.multiSelect')" placement="bottom">
              <el-button
                link
                size="small"
                :icon="CircleCheck"
                type="primary"
                class="header-action-btn"
                @click="toggleSelectionMode"
              />
            </el-tooltip>
            <el-popconfirm
              :title="t('playlist.deleteConfirm')"
              :confirm-button-text="t('common.confirmDelete')"
              :cancel-button-text="t('common.cancel')"
              width="320"
              trigger="click"
              @confirm="confirmDelete"
            >
              <template #reference>
                <el-button
                  link
                  size="small"
                  :icon="Minus"
                  type="default"
                  class="header-action-btn"
                  :title="t('playlist.delete')"
                  :aria-label="t('playlist.delete')"
                  @click.stop
                />
              </template>
            </el-popconfirm>
          </template>
        </div>
      </div>

      <div v-if="resolvedItems.length === 0" class="empty-list">
        <el-empty :description="t('playlist.empty')" />
      </div>

      <!-- 虚拟滚动：歌单条目较多时只渲染可视区域 -->
      <div
        v-else-if="useVirtual"
        v-bind="containerProps"
        class="list-scroll list-scroll-virtual"
      >
        <div v-bind="wrapperProps" class="list-rows">
          <div
            v-for="{ data: entry, index } in virtualList"
            :key="entry.key"
            class="list-row"
            :class="{
              'is-current': isCurrent(entry) && !selectionMode,
              'is-selected': isRowSelected(index),
            }"
            :style="{ height: rowHeight + 'px', minHeight: rowHeight + 'px' }"
            @click="selectionMode ? toggleSelectRow(index) : undefined"
            @dblclick="!selectionMode && playAt(index)"
          >
            <div class="col-play">
              <el-checkbox
                v-if="selectionMode"
                :model-value="isRowSelected(index)"
                @click.stop
                @change="toggleSelectRow(index)"
              />
              <el-button
                v-else
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
            <div v-if="!selectionMode" class="col-actions">
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
      </div>

      <el-scrollbar v-else class="list-scroll">
        <div class="list-rows">
          <div
            v-for="(entry, index) in displayItems"
            :key="entry.key"
            class="list-row"
            :class="{
              'is-current': isCurrent(entry) && !selectionMode,
              'is-selected': isRowSelected(index),
            }"
            @click="selectionMode ? toggleSelectRow(index) : undefined"
            @dblclick="!selectionMode && playAt(index)"
          >
            <div class="col-play">
              <el-checkbox
                v-if="selectionMode"
                :model-value="isRowSelected(index)"
                @click.stop
                @change="toggleSelectRow(index)"
              />
              <el-button
                v-else
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
            <div v-if="!selectionMode" class="col-actions">
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
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import { useI18n } from "vue-i18n";
import {
  CaretRight,
  VideoPause,
  Headset,
  Minus,
  EditPen,
  CircleCheck,
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

const selectionMode = ref(false);
const selectedIndices = ref<Set<number>>(new Set());

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selectedIndices.value = new Set();
}

function toggleSelectRow(index: number) {
  if (!selectionMode.value) return;
  const next = new Set(selectedIndices.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  selectedIndices.value = next;
}

function isRowSelected(index: number) {
  return selectedIndices.value.has(index);
}

function selectAll() {
  if (!playlist.value) return;
  selectedIndices.value = new Set(
    Array.from({ length: playlist.value.items.length }, (_, i) => i)
  );
}

function deselectAll() {
  selectedIndices.value = new Set();
}

function removeSelectedFromPlaylist() {
  const list = playlist.value;
  if (!list || selectedIndices.value.size === 0) return;
  const indices = Array.from(selectedIndices.value).sort((a, b) => b - a);
  for (const index of indices) {
    playlistStore.removeFromPlaylist(list.id, index);
  }
  selectedIndices.value = new Set();
  selectionMode.value = false;
}

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

const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight } =
  useVirtualListWhenLong<ResolvedEntry>({ source: displayItems });

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

<link rel="stylesheet" href="./PlaylistView.css" />

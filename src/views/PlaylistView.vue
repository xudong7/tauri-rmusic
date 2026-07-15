<template>
  <PageLayout class="playlist-view">
    <div v-if="!playlist" class="playlist-empty">
      <el-empty :description="t('playlist.notFound')" />
    </div>
    <template v-else>
      <PageHeader
        :title="displayName"
        :subtitle="t('playlist.trackCount', { count: playlist.items.length })"
      >
        <template #after-title>
          <el-tooltip v-if="!editingName" :content="t('playlist.rename')" placement="top">
            <el-button
              link
              size="small"
              :icon="EditPen"
              type="primary"
              class="header-action-btn app-icon-button"
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
        </template>
        <template #actions>
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
            <el-tooltip :content="t('playlist.playAll')" placement="bottom">
              <el-button
                circle
                size="small"
                :icon="VideoPlay"
                type="primary"
                class="header-action-btn playlist-play-all app-icon-button app-icon-button--primary"
                :disabled="!hasPlayableItems"
                @click="playAll"
              />
            </el-tooltip>
            <el-tooltip :content="t('musicList.multiSelect')" placement="bottom">
              <el-button
                link
                size="small"
                :icon="CircleCheck"
                type="primary"
                class="header-action-btn app-icon-button"
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
                  :icon="Delete"
                  type="default"
                  class="header-action-btn playlist-delete-action app-icon-button app-icon-button--danger"
                  :title="t('playlist.delete')"
                  :aria-label="t('playlist.delete')"
                  @click.stop
                />
              </template>
            </el-popconfirm>
          </template>
        </template>
      </PageHeader>

      <div v-if="resolvedItems.length === 0" class="empty-list playlist-empty-state">
        <el-empty :description="t('playlist.empty')" />
        <div class="playlist-empty-actions">
          <el-button :icon="Folder" @click="router.push('/')">
            {{ t("playlist.browseLibrary") }}
          </el-button>
          <el-button type="primary" :icon="Search" @click="router.push('/online')">
            {{ t("playlist.browseOnline") }}
          </el-button>
        </div>
      </div>

      <TrackList
        v-else
        :items="trackRows"
        :selection-mode="selectionMode"
        :selected-keys="selectedRowKeys"
        width="reading"
        @activate="playAt($event.sourceIndex)"
        @toggle-current="playerStore.togglePlay"
        @toggle-select="toggleSelectRow($event.sourceIndex)"
        @visible-items="scheduleVisibleLocalCovers"
      >
        <template #empty>
          <el-empty :description="t('messages.noSearchResult')" />
        </template>
        <template #actions="{ item }">
          <el-button
            circle
            size="small"
            :icon="Minus"
            link
            type="default"
            @click.stop="removeAt(item.sourceIndex)"
          />
        </template>
      </TrackList>
    </template>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { useI18n } from "vue-i18n";
import {
  VideoPlay,
  Minus,
  Delete,
  EditPen,
  CircleCheck,
  Folder,
  Search,
} from "@element-plus/icons-vue";
import type { PlaylistItem, MusicFile, SongInfo } from "@/types/model";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import { ViewMode } from "@/types/model";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

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

function selectAll() {
  if (!playlist.value) return;
  selectedIndices.value = new Set(
    filteredResolvedItems.value.map((item) => item.sourceIndex)
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
const localMusicByFileName = computed(() => {
  const map = new Map<string, MusicFile>();
  for (const file of localStore.musicFiles) {
    map.set(file.file_name, file);
  }
  return map;
});

watch(
  () => playlist.value?.items.length ?? 0,
  (length) => {
    if (!selectionMode.value || selectedIndices.value.size === 0) return;
    const next = new Set(
      Array.from(selectedIndices.value).filter((index) => index >= 0 && index < length)
    );
    if (next.size !== selectedIndices.value.size) selectedIndices.value = next;
  }
);

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
  sourceIndex: number;
  title: string;
  artist: string;
  coverUrl: string;
  coverKey: string;
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
      const file = localMusicByFileName.value.get(item.file_name);
      const display = getDisplayName(item.file_name);
      result.push({
        key: `local_${i}_${item.file_name}`,
        sourceIndex: i,
        title: extractSongTitle(display) || display,
        artist: extractArtistName(display) || t("common.unknownArtist"),
        coverUrl: "",
        coverKey: file?.key ?? item.file_name,
        item,
        musicFile: file ?? null,
        songInfo: null,
      });
    } else {
      const s = item.song;
      result.push({
        key: `online_${i}_${s.id}`,
        sourceIndex: i,
        title: s.name,
        artist: s.artists?.join(", ") ?? t("common.unknownArtist"),
        coverUrl: s.pic_url ?? "",
        coverKey: s.id,
        item,
        musicFile: null,
        songInfo: s,
      });
    }
  }
  return result;
});

const filteredResolvedItems = computed(() => {
  const keyword = viewStore.playlistSearchKeyword.trim().toLocaleLowerCase();
  if (!keyword) return resolvedItems.value;
  return resolvedItems.value.filter((entry) =>
    `${entry.title} ${entry.artist}`.toLocaleLowerCase().includes(keyword)
  );
});

const { getCover, scheduleMany: scheduleLocalCoverLoadMany } =
  useLocalCoverCache<ResolvedEntry>({
    getKey: (entry) => entry.coverKey,
    getFileName: (entry) => (entry.item.type === "local" ? entry.item.file_name : ""),
    getDefaultDirectory: () => localStore.getDefaultDirectory(),
  });

const hasPlayableItems = computed(() =>
  resolvedItems.value.some(
    (entry) => entry.item.type === "online" || entry.musicFile !== null
  )
);

function isCurrent(entry: ResolvedEntry) {
  if (entry.musicFile && playerStore.currentMusic)
    return playerStore.currentMusic.file_name === entry.musicFile.file_name;
  if (entry.songInfo && playerStore.currentOnlineSong)
    return playerStore.currentOnlineSong.id === entry.songInfo.id;
  return false;
}

function toTrackRow(entry: ResolvedEntry): TrackRowModel {
  return {
    key: entry.key,
    title: entry.title,
    artist: entry.artist,
    coverUrl: entry.item.type === "online" ? entry.coverUrl : () => getCover(entry),
    source: "playlist",
    sourceIndex: entry.sourceIndex,
    isCurrent: isCurrent(entry),
    isPlaying: playerStore.isPlaying,
    disabled: entry.item.type === "local" && entry.musicFile === null,
  };
}

const trackRows = computed(() => filteredResolvedItems.value.map(toTrackRow));
const selectedRowKeys = computed(
  () =>
    new Set(
      trackRows.value
        .filter((item) => selectedIndices.value.has(item.sourceIndex))
        .map((item) => item.key)
    )
);

function scheduleVisibleLocalCovers(items: TrackRowModel[]) {
  scheduleLocalCoverLoadMany(
    items
      .map((item) => resolvedItems.value[item.sourceIndex])
      .filter((entry): entry is ResolvedEntry =>
        Boolean(entry?.item.type === "local" && entry.musicFile)
      )
  );
}

function playAt(index: number) {
  const list = playlist.value;
  if (!list) return;
  playerStore.playFromPlaylist(list.id, index);
}

function playAll() {
  const entry = resolvedItems.value.find(
    (item) => item.item.type === "online" || item.musicFile !== null
  );
  if (entry) playAt(entry.sourceIndex);
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

<style scoped src="./PlaylistView.css"></style>

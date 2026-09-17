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
        <template #before-title>
          <PlaylistCover
            :item="playlist.items[0]"
            :size="44"
            :radius="10"
            class="playlist-header-cover"
          />
        </template>
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
            <el-tooltip :content="t('musicList.multiSelect')" placement="bottom">
              <el-button
                link
                size="small"
                :icon="MultiSelectIcon"
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
                  :icon="TrashIcon"
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
        :current-key="currentRowKey"
        :is-playing="playerStore.isPlaying"
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
import { useRowSelection } from "@/composables/useRowSelection";
import { useI18n } from "vue-i18n";
import { Minus, EditPen, Folder, Search } from "@element-plus/icons-vue";
import MultiSelectIcon from "@/components/base/icons/MultiSelectIcon.vue";
import TrashIcon from "@/components/base/icons/TrashIcon.vue";
import type { PlaylistItem, MusicFile, SongInfo } from "@/types/model";
import { formatDurationLabel, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";
import PlaylistCover from "@/components/feature/PlaylistCover/PlaylistCover.vue";

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

function removeSelectedFromPlaylist() {
  const list = playlist.value;
  if (!list || selectedIndices.value.size === 0) return;
  const indices = Array.from(selectedIndices.value).sort((a, b) => b - a);
  for (const index of indices) {
    playlistStore.removeFromPlaylist(list.id, index);
  }
  clearSelection();
}

const playlistId = computed(() => route.params.id as string);
const playlist = computed(() =>
  playlistId.value && playlistId.value !== "new"
    ? playlistStore.getPlaylist(playlistId.value)
    : undefined
);

const displayName = computed(() => playlist.value?.name ?? t("playlist.unnamed"));
const localMusicByFileName = computed(() => localStore.musicFilesByName);

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
  album?: string;
  durationLabel?: string;
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
      const display = getLocalMusicDisplayInfo(
        file ?? { id: -1, file_name: item.file_name },
        t("common.unknownArtist")
      );
      result.push({
        key: `local_${i}_${item.file_name}`,
        sourceIndex: i,
        title: display.title,
        artist: display.artist,
        album: display.album,
        durationLabel: formatDurationLabel(file?.duration_ms),
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
        album: s.album || undefined,
        durationLabel: formatDurationLabel(s.duration),
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
    `${entry.title} ${entry.artist} ${entry.album ?? ""}`
      .toLocaleLowerCase()
      .includes(keyword)
  );
});

const {
  selectionMode,
  selectedKeys: selectedIndices,
  toggleSelectionMode,
  toggleSelectRow,
  selectAll,
  deselectAll,
  clearSelection,
} = useRowSelection<number>({
  getSelectableKeys: () => filteredResolvedItems.value.map((item) => item.sourceIndex),
  getAvailableKeys: () => new Set(playlist.value?.items.map((_, index) => index) ?? []),
});

const { getCover, scheduleMany: scheduleLocalCoverLoadMany } =
  useLocalCoverCache<ResolvedEntry>({
    getKey: (entry) => entry.coverKey,
    getFileName: (entry) => (entry.item.type === "local" ? entry.item.file_name : ""),
    getDefaultDirectory: () => localStore.getDefaultDirectory(),
  });

// 当前曲目对应哪一行：行 key 由「类型 + 下标 + 文件名/ID」拼成，
// 重排后下标会变，所以必须从这里现算，不能烘焙进行对象。
const currentRowKey = computed(() => {
  const currentLocalName = playerStore.currentMusic?.file_name;
  const currentOnlineId = playerStore.currentOnlineSong?.id;
  if (!currentLocalName && !currentOnlineId) return null;
  const match = resolvedItems.value.find((entry) => {
    if (entry.musicFile && currentLocalName)
      return entry.musicFile.file_name === currentLocalName;
    if (entry.songInfo && currentOnlineId) return entry.songInfo.id === currentOnlineId;
    return false;
  });
  return match?.key ?? null;
});

function toTrackRow(entry: ResolvedEntry): TrackRowModel {
  return {
    key: entry.key,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    durationLabel: entry.durationLabel,
    coverUrl: entry.item.type === "online" ? entry.coverUrl : () => getCover(entry),
    source: "playlist",
    sourceIndex: entry.sourceIndex,
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

function removeAt(index: number) {
  if (!playlist.value) return;
  playlistStore.removeFromPlaylist(playlist.value.id, index);
}

watch(editingName, (v) => {
  if (v) nextTick(() => nameInputRef.value?.focus());
});
</script>

<style scoped src="./PlaylistView.css"></style>

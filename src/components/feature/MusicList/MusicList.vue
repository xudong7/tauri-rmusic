<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Upload, Plus, CircleCheck } from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { ElMessage } from "element-plus";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackRow from "@/components/feature/TrackList/TrackRow.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

const { t } = useI18n();
const playlistStore = usePlaylistStore();

const selectionMode = ref(false);
const selectedKeys = ref<Set<string>>(new Set());

function getFileKey(file: MusicFile): string {
  return file.relative_path || file.file_name;
}

const selectedFiles = computed(() =>
  props.musicFiles.filter((file) => selectedKeys.value.has(getFileKey(file)))
);

const displayInfoByKey = computed(() => {
  const map = new Map<string, { title: string; artist: string }>();
  for (const file of props.musicFiles) {
    const displayName = getDisplayName(file.file_name);
    map.set(getFileKey(file), {
      title: extractSongTitle(displayName),
      artist: extractArtistName(displayName) || t("common.unknownArtist"),
    });
  }
  return map;
});

function getDisplayInfo(row: MusicFile) {
  return (
    displayInfoByKey.value.get(getFileKey(row)) ?? {
      title: getDisplayName(row.file_name),
      artist: t("common.unknownArtist"),
    }
  );
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selectedKeys.value.clear();
}

function toggleSelectRow(row: MusicFile) {
  if (!selectionMode.value) return;
  const key = getFileKey(row);
  const next = new Set(selectedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedKeys.value = next;
}

function isRowSelected(row: MusicFile) {
  return selectedKeys.value.has(getFileKey(row));
}

function selectAll() {
  selectedKeys.value = new Set(props.musicFiles.map(getFileKey));
}

function deselectAll() {
  selectedKeys.value = new Set();
}

function handleBatchAddToPlaylist(command: string) {
  const files = selectedFiles.value;
  if (files.length === 0) return;
  if (command === "new") {
    const list = playlistStore.createPlaylist(t("playlist.newPlaylist"));
    for (const file of files) {
      playlistStore.addToPlaylist(list.id, { type: "local", file_name: file.file_name });
    }
    ElMessage.success(t("playlist.added", { name: list.name }));
  } else {
    const pl = playlistStore.getPlaylist(command);
    const name = pl?.name ?? "";
    let added = 0;
    for (const file of files) {
      if (
        playlistStore.addToPlaylist(command, { type: "local", file_name: file.file_name })
      )
        added++;
    }
    if (added > 0) {
      ElMessage.success(t("playlist.added", { name }));
    }
    if (added < files.length) {
      ElMessage.info(t("playlist.alreadyInPlaylist", { name }));
    }
  }
  selectedKeys.value = new Set();
  selectionMode.value = false;
}

const props = withDefaults(
  defineProps<{
    musicFiles: MusicFile[];
    currentMusic: MusicFile | null;
    isPlaying: boolean;
    showImportButton?: boolean;
    getDefaultDirectory?: () => string | null;
  }>(),
  {
    showImportButton: false,
    getDefaultDirectory: () => null,
  }
);

const emit = defineEmits(["play", "import"]);

watch(
  () => props.musicFiles,
  (files) => {
    if (!selectionMode.value || selectedKeys.value.size === 0) return;
    const availableKeys = new Set(files.map(getFileKey));
    const next = new Set(
      Array.from(selectedKeys.value).filter((key) => availableKeys.has(key))
    );
    if (next.size !== selectedKeys.value.size) selectedKeys.value = next;
  }
);

const isCurrentMusic = (music: MusicFile) =>
  props.currentMusic !== null && getFileKey(props.currentMusic) === getFileKey(music);

function toTrackRow(music: MusicFile, sourceIndex: number): TrackRowModel {
  const display = getDisplayInfo(music);
  return {
    key: getFileKey(music),
    title: display.title,
    artist: display.artist,
    coverUrl: getCover(music),
    source: "local",
    sourceIndex,
    isCurrent: isCurrentMusic(music),
    isPlaying: props.isPlaying,
  };
}

function handleRowDblClick(row: MusicFile) {
  emit("play", row);
}

function handleAddToPlaylist(command: string, row: MusicFile) {
  const item = { type: "local" as const, file_name: row.file_name };
  if (command === "new") {
    const list = playlistStore.createPlaylist(t("playlist.newPlaylist"));
    playlistStore.addToPlaylist(list.id, item);
    ElMessage.success(t("playlist.added", { name: list.name }));
  } else {
    const added = playlistStore.addToPlaylist(command, item);
    const pl = playlistStore.getPlaylist(command);
    const name = pl?.name ?? "";
    if (added) {
      ElMessage.success(t("playlist.added", { name }));
    } else {
      ElMessage.info(t("playlist.alreadyInPlaylist", { name }));
    }
  }
}

const { getCover, scheduleMany: scheduleCoverLoadMany } = useLocalCoverCache<MusicFile>({
  getKey: (file) => file.key ?? file.id,
  getFileName: (file) => file.file_name,
  getDefaultDirectory: props.getDefaultDirectory,
});

const musicFilesRef = computed(() => props.musicFiles);
const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight } =
  useVirtualListWhenLong<MusicFile>({ source: musicFilesRef });

const visibleCoverItems = computed(() =>
  useVirtual.value ? virtualList.value.map(({ data }) => data) : props.musicFiles
);

watch(
  visibleCoverItems,
  (files) => {
    // 虚拟滚动时只加载可见区域封面；普通列表保留一次性加载。
    scheduleCoverLoadMany(files);
  },
  { immediate: true }
);
</script>

<template>
  <PageLayout class="music-list-container">
    <PageHeader :title="t('musicList.title')">
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
          <el-dropdown
            v-if="selectedKeys.size > 0"
            trigger="click"
            @command="handleBatchAddToPlaylist"
          >
            <el-button type="primary" size="small" class="batch-add-btn">
              <el-icon class="batch-add-icon"><Plus /></el-icon>
              {{ t("musicList.addSelectedToPlaylist") }} ({{ selectedKeys.size }})
            </el-button>
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
        <template v-else>
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
          <el-tooltip
            v-if="showImportButton"
            :content="t('musicList.import')"
            placement="bottom"
          >
            <el-button
              link
              size="small"
              :icon="Upload"
              type="primary"
              class="header-action-btn app-icon-button"
              @click="emit('import')"
            />
          </el-tooltip>
        </template>
      </template>
    </PageHeader>

    <div v-if="musicFiles.length === 0" class="empty-list">
      <el-empty :description="t('musicList.empty')" />
    </div>

    <!-- 虚拟滚动：仅渲染可视区域，适合大量曲目 -->
    <div
      v-else-if="useVirtual"
      v-bind="containerProps"
      class="list-scroll list-scroll-virtual"
    >
      <div v-bind="wrapperProps" class="list-rows">
        <TrackRow
          v-for="{ data: row, index } in virtualList"
          :key="getFileKey(row)"
          :item="toTrackRow(row, index)"
          :selection-mode="selectionMode"
          :selected="isRowSelected(row)"
          :row-height="rowHeight"
          @activate="handleRowDblClick(row)"
          @toggle-select="toggleSelectRow(row)"
        >
          <template #actions>
            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleAddToPlaylist(cmd, row)"
            >
              <el-button circle size="small" :icon="Plus" link @click.stop />
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
        </TrackRow>
      </div>
    </div>

    <!-- 普通列表：曲目较少时使用，保留 el-scrollbar 样式 -->
    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
        <TrackRow
          v-for="(row, index) in musicFiles"
          :key="getFileKey(row)"
          :item="toTrackRow(row, index)"
          :selection-mode="selectionMode"
          :selected="isRowSelected(row)"
          @activate="handleRowDblClick(row)"
          @toggle-select="toggleSelectRow(row)"
        >
          <template #actions>
            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleAddToPlaylist(cmd, row)"
            >
              <el-button circle size="small" :icon="Plus" link @click.stop />
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
        </TrackRow>
      </div>
    </el-scrollbar>
  </PageLayout>
</template>

<style scoped src="./MusicList.css" />

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Upload, Plus, CircleCheck } from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { ElMessage } from "element-plus";
import { formatDuration, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
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
  const map = new Map<string, { title: string; artist: string; album?: string }>();
  for (const file of props.musicFiles) {
    map.set(getFileKey(file), getLocalMusicDisplayInfo(file, t("common.unknownArtist")));
  }
  return map;
});

function getDisplayInfo(row: MusicFile) {
  return (
    displayInfoByKey.value.get(getFileKey(row)) ?? {
      title: row.file_name,
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
    loading?: boolean;
    refreshing?: boolean;
    showImportButton?: boolean;
    getDefaultDirectory?: () => string | null;
  }>(),
  {
    showImportButton: false,
    loading: false,
    refreshing: false,
    getDefaultDirectory: () => null,
  }
);

const librarySubtitle = computed(() => {
  if (props.refreshing && props.musicFiles.length) return t("musicList.updating");
  const totalDuration = props.musicFiles.reduce(
    (total, file) => total + Math.max(0, file.duration_ms ?? 0),
    0
  );
  return t("musicList.summary", {
    count: props.musicFiles.length,
    minutes: Math.round(totalDuration / 60_000),
  });
});

const emit = defineEmits(["play", "toggle-current", "import"]);

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
    album: display.album,
    durationLabel:
      music.duration_ms && music.duration_ms > 0
        ? formatDuration(music.duration_ms)
        : undefined,
    coverUrl: () => getCover(music),
    source: "local",
    sourceIndex,
    isCurrent: isCurrentMusic(music),
    isPlaying: props.isPlaying,
  };
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

const trackRows = computed(() => props.musicFiles.map(toTrackRow));

function scheduleVisibleCovers(items: TrackRowModel[]) {
  scheduleCoverLoadMany(
    items
      .map((item) => props.musicFiles[item.sourceIndex])
      .filter((file): file is MusicFile => Boolean(file))
  );
}
</script>

<template>
  <PageLayout class="music-list-container">
    <PageHeader :title="t('musicList.title')" :subtitle="librarySubtitle">
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
          <el-tooltip
            v-if="showImportButton"
            :content="t('musicList.importFolder')"
            placement="bottom"
          >
            <el-button
              size="small"
              :icon="Upload"
              type="primary"
              class="library-import-btn"
              @click="emit('import')"
            >
              {{ t("musicList.import") }}
            </el-button>
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
        </template>
      </template>
    </PageHeader>

    <TrackList
      :items="trackRows"
      :loading="loading"
      :selection-mode="selectionMode"
      :selected-keys="selectedKeys"
      width="reading"
      @activate="emit('play', musicFiles[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @toggle-select="toggleSelectRow(musicFiles[$event.sourceIndex])"
      @visible-items="scheduleVisibleCovers"
    >
      <template #loading>
        <el-skeleton :rows="6" animated />
      </template>
      <template #empty>
        <el-empty :description="t('musicList.empty')" />
      </template>
      <template #actions="{ item }">
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => handleAddToPlaylist(cmd, musicFiles[item.sourceIndex])
          "
        >
          <el-button circle size="small" :icon="Plus" link />
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
  </PageLayout>
</template>

<style scoped src="./MusicList.css" />

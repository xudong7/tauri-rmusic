<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Upload, Plus } from "@element-plus/icons-vue";
import MultiSelectIcon from "@/components/base/icons/MultiSelectIcon.vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { ElMessage } from "element-plus";
import { formatDurationLabel, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { useRowSelection } from "@/composables/useRowSelection";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

const { t } = useI18n();
const playlistStore = usePlaylistStore();

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
  clearSelection();
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
  // 空曲库时不显示「0 首歌曲 · 0 分钟」：零个东西的统计不是信息，只是噪音，
  // 而下面正中央已经有一句「曲库还是空的」在说同一件事。
  if (props.musicFiles.length === 0) return undefined;
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

const {
  selectionMode,
  selectedKeys,
  toggleSelectionMode,
  toggleSelectRow: toggleSelectKey,
  selectAll,
  deselectAll,
  clearSelection,
} = useRowSelection<string>({
  getSelectableKeys: () => props.musicFiles.map(getFileKey),
  getAvailableKeys: () => new Set(props.musicFiles.map(getFileKey)),
});

function toggleSelectRow(row: MusicFile) {
  toggleSelectKey(getFileKey(row));
}

const currentKey = computed(() =>
  props.currentMusic ? getFileKey(props.currentMusic) : null
);

function toTrackRow(music: MusicFile, sourceIndex: number): TrackRowModel {
  const display = getDisplayInfo(music);
  return {
    key: getFileKey(music),
    title: display.title,
    artist: display.artist,
    album: display.album,
    durationLabel: formatDurationLabel(music.duration_ms),
    coverUrl: () => getCover(music),
    source: "local",
    sourceIndex,
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
            :content="t('musicList.importMusic')"
            placement="bottom"
          >
            <!-- 只留图标：与同排的多选键外观一致，含义由 tooltip 交代 -->
            <el-button
              link
              size="small"
              :icon="Upload"
              class="header-action-btn app-icon-button"
              @click="emit('import')"
            />
          </el-tooltip>
          <el-tooltip :content="t('musicList.multiSelect')" placement="bottom">
            <el-button
              link
              size="small"
              :icon="MultiSelectIcon"
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
      :current-key="currentKey"
      :is-playing="props.isPlaying"
      @activate="emit('play', musicFiles[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @toggle-select="toggleSelectRow(musicFiles[$event.sourceIndex])"
      @visible-items="scheduleVisibleCovers"
    >
      <template #loading>
        <el-skeleton :rows="6" animated />
      </template>
      <!-- 空状态自带动作：原先它写着「点击「导入音乐」添加」，而那个按钮只有
           一个 ↑ 图标、在页面右上角，界面上任何地方都没有「导入音乐」这四个字
           （tooltip 当时还写成「从文件夹导入音乐」，而它打开的是多选文件对话框）。
           与其让用户去找，不如把动作放在他正在读的那句话旁边。 -->
      <template #empty>
        <el-empty :description="t('musicList.empty')" :image-size="96">
          <p class="music-list__empty-hint">{{ t("musicList.emptyHint") }}</p>
          <el-button
            v-if="showImportButton"
            type="primary"
            :icon="Upload"
            @click="emit('import')"
          >
            {{ t("musicList.importMusic") }}
          </el-button>
        </el-empty>
      </template>
      <template #actions="{ item }">
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => handleAddToPlaylist(cmd, musicFiles[item.sourceIndex])
          "
        >
          <el-button
            circle
            size="small"
            :icon="Plus"
            link
            :aria-label="t('playlist.addToPlaylist')"
          />
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

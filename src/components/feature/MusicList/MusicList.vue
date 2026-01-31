<script setup lang="ts">
import { reactive, ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  CaretRight,
  VideoPause,
  Headset,
  Upload,
  Plus,
  CircleCheck,
} from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { ElMessage } from "element-plus";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { loadLocalCover } from "@/utils/coverUtils";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";

const { t } = useI18n();
const playlistStore = usePlaylistStore();

const selectionMode = ref(false);
const selectedIds = ref<Set<number>>(new Set());

const selectedFiles = computed(() =>
  props.musicFiles.filter((f) => selectedIds.value.has(f.id))
);

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selectedIds.value.clear();
}

function toggleSelectRow(row: MusicFile) {
  if (!selectionMode.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(row.id)) next.delete(row.id);
  else next.add(row.id);
  selectedIds.value = next;
}

function isRowSelected(row: MusicFile) {
  return selectedIds.value.has(row.id);
}

function selectAll() {
  selectedIds.value = new Set(props.musicFiles.map((f) => f.id));
}

function deselectAll() {
  selectedIds.value = new Set();
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
  selectedIds.value = new Set();
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

const isCurrentMusic = (m: MusicFile) => props.currentMusic?.id === m.id;

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

/**
 * 本地列表封面：按需加载 + 缓存 + 并发限制，避免大量 invoke 卡顿
 */
const coverById = reactive<Record<number, string>>({});
const coverQueue: MusicFile[] = [];
let coverRunning = 0;
const MAX_COVER_CONCURRENCY = 4;

function scheduleCoverLoad(file: MusicFile) {
  if (coverById[file.id] !== undefined) return;
  coverQueue.push(file);
  pumpCoverQueue();
}

function pumpCoverQueue() {
  while (coverRunning < MAX_COVER_CONCURRENCY && coverQueue.length > 0) {
    const file = coverQueue.shift()!;
    if (coverById[file.id] !== undefined) continue;
    coverRunning++;
    (async () => {
      try {
        const url = await loadLocalCover(file.file_name, props.getDefaultDirectory);
        coverById[file.id] = url || "";
      } catch {
        coverById[file.id] = "";
      } finally {
        coverRunning--;
        pumpCoverQueue();
      }
    })();
  }
}

watch(
  () => props.musicFiles,
  (files) => {
    // 每次列表更新时为新条目加载封面；旧的 cache 保留
    for (const f of files) scheduleCoverLoad(f);
  },
  { immediate: true }
);

const musicFilesRef = computed(() => props.musicFiles);
const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight } =
  useVirtualListWhenLong<MusicFile>({ source: musicFilesRef });
</script>

<template>
  <div class="music-list-container">
    <div class="list-header">
      <h2 class="list-title">{{ t("musicList.title") }}</h2>
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
          <el-dropdown
            v-if="selectedIds.size > 0"
            trigger="click"
            @command="handleBatchAddToPlaylist"
          >
            <el-button type="primary" size="small" class="batch-add-btn">
              <el-icon class="batch-add-icon"><Plus /></el-icon>
              {{ t("musicList.addSelectedToPlaylist") }} ({{ selectedIds.size }})
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
              class="header-action-btn"
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
              class="header-action-btn"
              @click="emit('import')"
            />
          </el-tooltip>
        </template>
      </div>
    </div>

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
        <div
          v-for="{ data: row, index } in virtualList"
          :key="row.id"
          class="list-row"
          :class="{
            'is-current': isCurrentMusic(row) && !selectionMode,
            'is-selected': isRowSelected(row),
          }"
          :title="row.file_name"
          :data-index="index"
          :style="{ height: rowHeight + 'px', minHeight: rowHeight + 'px' }"
          @click="selectionMode ? toggleSelectRow(row) : undefined"
          @dblclick="!selectionMode && handleRowDblClick(row)"
        >
          <div class="col-play">
            <el-checkbox
              v-if="selectionMode"
              :model-value="isRowSelected(row)"
              @click.stop
              @change="toggleSelectRow(row)"
            />
            <el-button
              v-else
              circle
              size="small"
              :type="isCurrentMusic(row) ? 'primary' : 'default'"
              :icon="isCurrentMusic(row) && isPlaying ? VideoPause : CaretRight"
              @click="emit('play', row)"
            />
          </div>
          <div class="col-cover">
            <img
              v-if="coverById[row.id]"
              :src="coverById[row.id]"
              class="cover-img"
              alt=""
            />
            <div v-else class="cover-placeholder">
              <el-icon><Headset /></el-icon>
            </div>
          </div>
          <div class="col-main">
            <div class="song-title" :class="{ 'is-playing': isCurrentMusic(row) }">
              {{ extractSongTitle(getDisplayName(row.file_name)) }}
            </div>
            <div class="song-artist">
              {{
                extractArtistName(getDisplayName(row.file_name)) ||
                t("common.unknownArtist")
              }}
            </div>
          </div>
          <div v-if="!selectionMode" class="col-action">
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
          </div>
        </div>
      </div>
    </div>

    <!-- 普通列表：曲目较少时使用，保留 el-scrollbar 样式 -->
    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
        <div
          v-for="row in musicFiles"
          :key="row.id"
          class="list-row"
          :class="{
            'is-current': isCurrentMusic(row) && !selectionMode,
            'is-selected': isRowSelected(row),
          }"
          :title="row.file_name"
          @click="selectionMode ? toggleSelectRow(row) : undefined"
          @dblclick="!selectionMode && handleRowDblClick(row)"
        >
          <div class="col-play">
            <el-checkbox
              v-if="selectionMode"
              :model-value="isRowSelected(row)"
              @click.stop
              @change="toggleSelectRow(row)"
            />
            <el-button
              v-else
              circle
              size="small"
              :type="isCurrentMusic(row) ? 'primary' : 'default'"
              :icon="isCurrentMusic(row) && isPlaying ? VideoPause : CaretRight"
              @click="emit('play', row)"
            />
          </div>
          <div class="col-cover">
            <img
              v-if="coverById[row.id]"
              :src="coverById[row.id]"
              class="cover-img"
              alt=""
            />
            <div v-else class="cover-placeholder">
              <el-icon><Headset /></el-icon>
            </div>
          </div>
          <div class="col-main">
            <div class="song-title" :class="{ 'is-playing': isCurrentMusic(row) }">
              {{ extractSongTitle(getDisplayName(row.file_name)) }}
            </div>
            <div class="song-artist">
              {{
                extractArtistName(getDisplayName(row.file_name)) ||
                t("common.unknownArtist")
              }}
            </div>
          </div>
          <div v-if="!selectionMode" class="col-action">
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
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />

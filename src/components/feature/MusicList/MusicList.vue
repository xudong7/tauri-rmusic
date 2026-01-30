<script setup lang="ts">
import { reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CaretRight, VideoPause, Headset, Upload, Plus } from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { ElMessage } from "element-plus";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";
import { loadLocalCover } from "@/utils/coverUtils";

const { t } = useI18n();
const playlistStore = usePlaylistStore();

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
    playlistStore.addToPlaylist(command, item);
    const pl = playlistStore.getPlaylist(command);
    ElMessage.success(t("playlist.added", { name: pl?.name ?? "" }));
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
</script>

<template>
  <div class="music-list-container">
    <div class="list-header">
      <h2 class="list-title">{{ t("musicList.title") }}</h2>
      <el-button
        v-if="showImportButton"
        type="primary"
        :icon="Upload"
        size="default"
        class="import-btn"
        @click="emit('import')"
      >
        {{ t("musicList.import") }}
      </el-button>
    </div>

    <div v-if="musicFiles.length === 0" class="empty-list">
      <el-empty :description="t('musicList.empty')" />
    </div>

    <el-scrollbar v-else class="list-scroll">
      <div class="list-rows">
        <div
          v-for="row in musicFiles"
          :key="row.id"
          class="list-row"
          :class="{ 'is-current': isCurrentMusic(row) }"
          :title="row.file_name"
          @dblclick="handleRowDblClick(row)"
        >
          <div class="col-play">
            <el-button
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
          <div class="col-action">
            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleAddToPlaylist(cmd, row)"
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
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />

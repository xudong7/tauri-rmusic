<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { CaretRight, VideoPause, Headset, Upload } from "@element-plus/icons-vue";
import type { MusicFile } from "@/types/model";
import { getDisplayName, extractArtistName, extractSongTitle } from "@/utils/songUtils";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    musicFiles: MusicFile[];
    currentMusic: MusicFile | null;
    isPlaying: boolean;
    showImportButton?: boolean;
  }>(),
  { showImportButton: false }
);

const emit = defineEmits(["play", "import"]);

const isCurrentMusic = (m: MusicFile) => props.currentMusic?.id === m.id;

function handleRowDblClick(row: MusicFile) {
  emit("play", row);
}
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
            <div class="cover-placeholder">
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
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped src="./MusicList.css" />

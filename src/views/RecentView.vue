<script setup lang="ts">
/**
 * 最近播放 / 最常播放。
 *
 * 数据来自 playHistoryStore（playerStore 在播放成功后记一笔）。本地条目只存
 * 快照，真正的文件由曲库现查：查不到说明文件已被删除，行置灰不可播。
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { usePlayHistoryStore, type PlayHistoryEntry } from "@/stores/playHistoryStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import TrashIcon from "@/components/base/icons/TrashIcon.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";
import { formatArtists, formatDurationLabel } from "@/utils/songUtils";

const { t } = useI18n();
const history = usePlayHistoryStore();
const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();

type RecentMode = "recent" | "most";
const mode = ref<RecentMode>("recent");
const modeOptions = computed(() => [
  { label: t("recent.modeRecent"), value: "recent" },
  { label: t("recent.modeMost"), value: "most" },
]);

const entries = computed(() =>
  mode.value === "recent" ? history.recentEntries : history.mostPlayedEntries
);
const subtitle = computed(() => t("common.songCount", { count: entries.value.length }));

// 本地封面按文件名缓存：历史里同一首歌反复出现，缓存键取文件名而不是条目 key
const { getCover, scheduleMany } = useLocalCoverCache<PlayHistoryEntry>({
  getKey: (entry) => entry.local?.file_name ?? entry.key,
  getFileName: (entry) => entry.local?.file_name ?? "",
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
});

function localFileOf(entry: PlayHistoryEntry) {
  if (!entry.local) return null;
  return localStore.musicFilesByName.get(entry.local.file_name) ?? null;
}

const rows = computed<TrackRowModel[]>(() =>
  entries.value.map((entry, index) => {
    if (entry.source === "local" && entry.local) {
      const file = localFileOf(entry);
      return {
        key: entry.key,
        title: entry.local.title,
        artist: entry.local.artist,
        durationLabel: formatDurationLabel(file?.duration_ms),
        coverUrl: () => getCover(entry),
        source: "local",
        sourceIndex: index,
        disabled: !file,
      };
    }

    const song = entry.online!;
    return {
      key: entry.key,
      title: song.name,
      artist: formatArtists(song.artists),
      album: song.album || undefined,
      durationLabel: formatDurationLabel(song.duration),
      coverUrl: song.pic_url ?? "",
      source: "online",
      sourceIndex: index,
    };
  })
);

/** 队列只装同来源的条目：本地与在线不能混在一个播放队列里 */
const localQueue = computed(() =>
  entries.value.flatMap((entry) => {
    const file = localFileOf(entry);
    return file ? [file] : [];
  })
);
const onlineQueue = computed(() =>
  entries.value.flatMap((entry) => (entry.online ? [entry.online] : []))
);

function playEntry(index: number) {
  const entry = entries.value[index];
  if (!entry) return;
  if (entry.source === "local") {
    const file = localFileOf(entry);
    if (!file) return;
    void playerStore.playMusic(file, { queue: localQueue.value });
    return;
  }
  if (entry.online) {
    void playerStore.playOnlineSong(entry.online, { queue: onlineQueue.value });
  }
}

function scheduleVisibleCovers(items: TrackRowModel[]) {
  scheduleMany(
    items
      .map((item) => entries.value[item.sourceIndex])
      .filter((entry): entry is PlayHistoryEntry => Boolean(entry?.local))
  );
}

const currentKey = computed(() => {
  if (playerStore.currentMusic) return `local:${playerStore.currentMusic.file_name}`;
  if (playerStore.currentOnlineSong) return `online:${playerStore.currentOnlineSong.id}`;
  return "";
});
</script>

<template>
  <PageLayout class="recent-view">
    <PageHeader :title="t('recent.title')" :subtitle="subtitle">
      <template #actions>
        <el-segmented v-model="mode" :options="modeOptions" />
        <el-popconfirm
          v-if="history.entries.length > 0"
          :title="t('recent.clearConfirm')"
          :confirm-button-text="t('common.confirmDelete')"
          :cancel-button-text="t('common.cancel')"
          width="300"
          @confirm="history.clearHistory()"
        >
          <template #reference>
            <el-button
              circle
              class="recent-view__clear app-icon-button--danger"
              :icon="TrashIcon"
              :aria-label="t('recent.clear')"
              @click.stop
            />
          </template>
        </el-popconfirm>
      </template>
    </PageHeader>

    <TrackList
      :items="rows"
      :current-key="currentKey"
      :is-playing="playerStore.isPlaying"
      :scroll-key="`recent:${mode}`"
      @activate="playEntry($event.sourceIndex)"
      @toggle-current="playerStore.togglePlay"
      @visible-items="scheduleVisibleCovers"
    >
      <template #empty>
        <el-empty :description="t('recent.empty')" :image-size="96" />
      </template>
    </TrackList>
  </PageLayout>
</template>

<style scoped>
.recent-view {
  overflow: hidden;
}

.recent-view__clear {
  width: var(--app-button-height);
  height: var(--app-button-height);
  padding: 0;
}
</style>

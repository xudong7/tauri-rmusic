<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Plus, Refresh } from "@element-plus/icons-vue";
import type { SongInfo } from "@/types/model";
import { formatDurationLabel, formatArtists } from "@/utils/songUtils";
import {
  useDownloadStore,
  pinsRowActions,
  type DownloadState,
} from "@/stores/downloadStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useOnlinePlaylistActions } from "@/composables/useOnlinePlaylistActions";
import CheckIcon from "@/components/base/icons/CheckIcon.vue";
import InLibraryIcon from "@/components/base/icons/InLibraryIcon.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

const { t } = useI18n();
const playlistStore = usePlaylistStore();
const downloadStore = useDownloadStore();
const { addOnlineSongToPlaylist } = useOnlinePlaylistActions();

const props = withDefaults(
  defineProps<{
    onlineSongs: SongInfo[];
    currentSong: SongInfo | null;
    isPlaying: boolean;
    loading: boolean;
    totalCount: number;
    /**
     * 是否还有下一页。显式传入时以它为准——部分接口（如歌手歌曲、
     * 歌单曲目）不返回可用的总数，此时 totalCount 为 0，
     * 沿用 `length >= totalCount` 会导致 load-more 永不触发。
     */
    hasMore?: boolean;
  }>(),
  {
    hasMore: undefined,
  }
);

const emit = defineEmits(["play", "toggle-current", "load-more"]);

function requestLoadMore() {
  if (props.loading) return;
  if (props.hasMore !== undefined) {
    if (!props.hasMore) return;
  } else if (props.onlineSongs.length >= props.totalCount) {
    return;
  }
  emit("load-more");
}

const currentKey = computed(() => props.currentSong?.id ?? null);

function toTrackRow(song: SongInfo, sourceIndex: number): TrackRowModel {
  return {
    key: song.id,
    title: song.name,
    artist: formatArtists(song.artists),
    album: song.album || undefined,
    durationLabel: formatDurationLabel(song.duration),
    coverUrl: song.pic_url,
    source: "online",
    sourceIndex,
  };
}

const trackRows = computed(() => props.onlineSongs.map(toTrackRow));

/** 行 key（即 song.id，见 toTrackRow）→ 下载状态。 */
const stateByRowKey = computed(() => {
  const states = new Map<string, DownloadState>();
  for (const song of props.onlineSongs) {
    states.set(song.id, downloadStore.statusFor(song));
  }
  return states;
});

function stateOfRow(key: string): DownloadState {
  return stateByRowKey.value.get(key) ?? "idle";
}

/**
 * 让操作簇常驻的行：下载中、刚完成、待重试。
 *
 * 操作簇默认悬停才显示，而这些是用户要盯着看的进度/结果——成功提示已经没有
 * toast 兜底了，鼠标一移开就什么都看不到。inLibrary 不算：那是环境状态，
 * 常驻只会让每个下过的行都多出两个按钮。
 */
const busyKeys = computed(() => {
  const keys = new Set<string>();
  for (const [key, state] of stateByRowKey.value) {
    if (pinsRowActions(state)) keys.add(key);
  }
  return keys;
});

/** 下载中走 :loading（图标被转圈盖住），其余状态各有自己的图标。
    查表写全，漏一个状态 TS 会报错。 */
const downloadIcons: Record<DownloadState, Component> = {
  idle: Download,
  downloading: Download,
  done: CheckIcon,
  inLibrary: InLibraryIcon,
  failed: Refresh,
};

const downloadLabels = computed<Record<DownloadState, string>>(() => ({
  idle: t("common.download"),
  downloading: t("download.downloading"),
  done: t("download.done"),
  inLibrary: t("download.inLibrary"),
  failed: t("download.failed"),
}));

function requestDownload(song: SongInfo) {
  // 失败会弹错误提示并在行上留下重试图标；重复点击由 store 的 inflight 去重。
  void downloadStore.download(song);
}

/** 加入歌单后让 Plus 闪一下打勾。 */
const FLASH_DURATION_MS = 1600;
const flashedKey = ref<string | null>(null);
const flashedLabel = ref("");
let flashTimer: ReturnType<typeof setTimeout> | null = null;

async function handleAddToPlaylist(command: string, song: SongInfo) {
  const result = await addOnlineSongToPlaylist(command, song);
  // 失败时下载 store 已经弹过错误提示，按钮不该显示「成功」。
  if (result.outcome === "failed") return;

  flashedLabel.value = t(
    result.outcome === "added" ? "playlist.added" : "playlist.alreadyInPlaylist",
    { name: result.playlistName }
  );
  flashedKey.value = song.id;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashedKey.value = null;
    flashTimer = null;
  }, FLASH_DURATION_MS);
}

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer);
});
</script>

<template>
  <div class="online-music-list-container">
    <TrackList
      :items="trackRows"
      :loading="loading"
      :current-key="currentKey"
      :is-playing="props.isPlaying"
      :busy-keys="busyKeys"
      @activate="emit('play', onlineSongs[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @near-end="requestLoadMore"
    >
      <!-- 透传父组件的同名插槽，未提供时回退到通用文案。
           歌单/专辑/歌手页各自传入了更准确的空状态（如「歌单不存在或已被删除」），
           不透传的话这些提示会被这里的内容静默取代。 -->
      <template #loading>
        <slot name="loading">
          <el-skeleton :rows="5" animated />
        </slot>
      </template>
      <template #empty>
        <slot name="empty">
          <el-empty :description="t('onlineMusic.empty')" />
        </slot>
      </template>
      <template #actions="{ item }">
        <!-- 下载按钮在五种状态下始终是同一个按钮，从不 v-if 移除：
             否则旁边 Plus 的位置会跟着跳。状态只体现在图标与 tooltip 上。 -->
        <el-tooltip :content="downloadLabels[stateOfRow(item.key)]" placement="top">
          <el-button
            circle
            size="small"
            link
            class="download-action"
            :icon="downloadIcons[stateOfRow(item.key)]"
            :loading="stateOfRow(item.key) === 'downloading'"
            :aria-label="downloadLabels[stateOfRow(item.key)]"
            @click="requestDownload(onlineSongs[item.sourceIndex])"
          />
        </el-tooltip>
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => handleAddToPlaylist(cmd, onlineSongs[item.sourceIndex])
          "
        >
          <!-- 这里不套 tooltip：el-dropdown 把触发事件绑在**直接子元素**上，
               中间隔一层组件就绑不上——真实浏览器里点了没有任何反应，菜单
               永远不弹，而且 jsdom 抓不到（测试的 trigger("click") 是直接派发
               到按钮节点上的，绕过了「点击到底落在谁身上」这一层）。
               曲库那个加号正是 el-dropdown 直接包 el-button，所以它能弹。
               语义交给 aria-label，与曲库那处保持一致。 -->
          <el-button
            circle
            size="small"
            link
            class="playlist-action"
            :icon="flashedKey === item.key ? CheckIcon : Plus"
            :aria-label="
              flashedKey === item.key ? flashedLabel : t('playlist.addToPlaylist')
            "
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
  </div>
</template>

<style scoped src="./OnlineMusicList.css" />

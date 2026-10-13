<template>
  <PageLayout class="playlist-view">
    <div v-if="!playlist" class="playlist-empty">
      <el-empty :description="t('playlist.notFound')" :image-size="96" />
    </div>
    <template v-else>
      <DetailHero
        variant="playlist"
        :eyebrow="t('playlist.created')"
        :title="displayName"
        :meta="t('common.songCount', { count: playlist.items.length })"
      >
        <!-- 自建歌单的封面来自第一首歌，要经 useCoverLoader 异步解析，
             所以这里传组件而不是地址。 -->
        <template #cover>
          <PlaylistCover :item="playlist.items[0]" :size="124" :radius="12" />
        </template>

        <!-- 重命名仍在标题这一行原地发生 -->
        <template v-if="editingName" #title>
          <el-input
            ref="nameInputRef"
            v-model="editNameValue"
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
            <el-tooltip :content="t('playlist.rename')" placement="bottom">
              <el-button
                circle
                class="playlist-header-action"
                :icon="EditPen"
                :aria-label="t('playlist.rename')"
                @click="editingName = true"
              />
            </el-tooltip>
            <el-tooltip :content="t('musicList.multiSelect')" placement="bottom">
              <el-button
                circle
                class="playlist-header-action"
                :icon="MultiSelectIcon"
                :aria-label="t('musicList.multiSelect')"
                @click="toggleSelectionMode"
              />
            </el-tooltip>
            <el-tooltip :content="t('playlist.exportM3u')" placement="bottom">
              <el-button
                circle
                class="playlist-header-action"
                :icon="Share"
                :loading="isExportingM3u"
                :aria-label="t('playlist.exportM3u')"
                @click="exportM3u"
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
                  circle
                  class="playlist-header-action app-icon-button--danger"
                  :icon="TrashIcon"
                  :aria-label="t('playlist.delete')"
                  @click.stop
                />
              </template>
            </el-popconfirm>
          </template>
        </template>
      </DetailHero>

      <div v-if="resolvedItems.length === 0" class="empty-list playlist-empty-state">
        <el-empty :description="t('playlist.empty')" :image-size="96" />
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
        :context-menu-items="contextMenuItems"
        :scroll-key="route.fullPath"
        @activate="playAt($event.sourceIndex)"
        @toggle-current="playerStore.togglePlay"
        @toggle-select="toggleSelectRow($event.sourceIndex)"
        @visible-items="scheduleVisibleLocalCovers"
      >
        <template #empty>
          <el-empty :description="t('messages.noSearchResult')" :image-size="96" />
        </template>
        <template #actions="{ item }">
          <!-- 文件被删了、而当初加入歌单时记住了来源：给一个重新下载。
               来源是加入歌单那一刻顺手记下的（见 useOnlinePlaylistActions），
               用户自己导入的本地文件没有来源，因此这里不会出现。 -->
          <el-tooltip
            v-if="item.disabled && sourceAt(item.sourceIndex)"
            :content="t('playlist.redownload')"
            placement="top"
          >
            <el-button
              circle
              size="small"
              link
              class="redownload-action"
              :icon="Download"
              :loading="isRedownloadingAt(item.sourceIndex)"
              :aria-label="t('playlist.redownload')"
              @click.stop="redownloadAt(item.sourceIndex)"
            />
          </el-tooltip>
          <el-button
            circle
            size="small"
            :icon="Minus"
            link
            type="default"
            :aria-label="t('contextMenu.removeFromPlaylist')"
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
import { Download, Minus, EditPen, Folder, Search, Share } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import MultiSelectIcon from "@/components/base/icons/MultiSelectIcon.vue";
import TrashIcon from "@/components/base/icons/TrashIcon.vue";
import type { PlaylistItem, MusicFile, SongInfo } from "@/types/model";
import {
  formatArtists,
  formatDurationLabel,
  getLocalMusicDisplayInfo,
} from "@/utils/songUtils";
import { save } from "@tauri-apps/plugin-dialog";
import { writeM3uFile } from "@/api/commands/file";
import { buildM3u } from "@/utils/m3u";
import { joinPathSegment } from "@/utils/pathUtils";
import { parseErrorMessage } from "@/utils/errorUtils";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useViewStore } from "@/stores/viewStore";
import { useDownloadStore } from "@/stores/downloadStore";
import type { ContextMenuItem } from "@/composables/useContextMenu";
import { revealLocalFile } from "@/utils/revealInFolder";
import DetailHero from "@/components/layout/DetailHero/DetailHero.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import type { TrackRowModel } from "@/components/feature/TrackList/types";
import PlaylistCover from "@/components/feature/PlaylistCover/PlaylistCover.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const playlistStore = usePlaylistStore();
const downloadStore = useDownloadStore();
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
        artist: formatArtists(s.artists) || t("common.unknownArtist"),
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

/**
 * 这一行的来源，两条路都查：
 *  1. 条目自己记的——「从在线搜索加进歌单」时写下的
 *  2. downloadStore 的索引——按文件名反查，「从曲库加进歌单」的歌靠这条
 *
 * 两条都查不到就是真的没有来源：用户自己导入的文件从来没有过。
 */
function sourceAt(index: number): SongInfo | null {
  const item = playlist.value?.items[index];
  if (!item || item.type !== "local") return null;
  return item.source ?? downloadStore.sourceFor(item.file_name);
}

/** 这一行是不是正在重新下载（转圈）。 */
function isRedownloadingAt(index: number): boolean {
  const source = sourceAt(index);
  return source !== null && downloadStore.statusFor(source) === "downloading";
}

/**
 * 重新下载这一行指向的歌。
 *
 * 下载走的是与搜索页同一个 store：它会顺带刷新曲库，而这一行的 musicFile 是从
 * 曲库里查出来的 computed——下完自己就从灰色恢复成正常行，不必手动重算。
 */
async function redownloadAt(index: number) {
  const source = sourceAt(index);
  if (!source) return;
  await downloadStore.download(source);
}

const trackRows = computed(() => filteredResolvedItems.value.map(toTrackRow));

/** 行右键菜单：下一首播放 / 在文件夹中显示（本地）/ 从歌单移除。 */
function contextMenuItems(item: TrackRowModel): ContextMenuItem[] {
  const entry = resolvedItems.value.find((candidate) => candidate.key === item.key);
  if (!entry) return [];
  const items: ContextMenuItem[] = [];

  if (entry.musicFile) {
    const file = entry.musicFile;
    items.push({
      key: "play-next",
      label: t("contextMenu.playNext"),
      action: () => void playerStore.playNextInQueue({ type: "local", file }),
    });
    items.push({
      key: "reveal",
      label: t("contextMenu.revealInFolder"),
      action: () => void revealLocalFile(file.file_name, localStore.currentDirectory),
    });
  } else if (entry.songInfo) {
    const song = entry.songInfo;
    items.push({
      key: "play-next",
      label: t("contextMenu.playNext"),
      action: () => void playerStore.playNextInQueue({ type: "online", song }),
    });
  }

  items.push({
    key: "remove",
    label: t("contextMenu.removeFromPlaylist"),
    danger: true,
    action: () => removeAt(entry.sourceIndex),
  });
  return items;
}
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

const isExportingM3u = ref(false);

/**
 * 导出 M3U：只导出文件还在的本地曲目（在线条目与缺文件的条目跳过并汇总）。
 * 写绝对路径：换台机器导入时对不上会退回按文件名匹配，至少还能找回同名文件。
 */
async function exportM3u() {
  const list = playlist.value;
  if (!list || isExportingM3u.value) return;

  // flatMap 而不是 filter：顺带把条目拍成导出需要的样子，
  // 也避开了「filter 不是类型守卫、联合类型收不窄」的问题
  const exportable = resolvedItems.value.flatMap((entry) =>
    entry.item.type === "local" && entry.musicFile
      ? [
          {
            fileName: entry.item.file_name,
            title: `${entry.artist} - ${entry.title}`,
            durationMs: entry.musicFile.duration_ms,
          },
        ]
      : []
  );
  if (exportable.length === 0) {
    ElMessage.warning(t("playlist.exportEmpty"));
    return;
  }

  const path = await save({
    defaultPath: `${list.name || t("playlist.unnamed")}.m3u`,
    filters: [{ name: "M3U", extensions: ["m3u", "m3u8"] }],
  });
  if (!path) return;

  isExportingM3u.value = true;
  try {
    const content = buildM3u(
      exportable.map((entry) => ({
        path: joinPathSegment(localStore.currentDirectory, entry.fileName),
        title: entry.title,
        durationMs: entry.durationMs,
      }))
    );
    await writeM3uFile({ path, content });

    const skipped = resolvedItems.value.length - exportable.length;
    ElMessage.success(
      skipped > 0
        ? t("playlist.exportDonePartial", { count: exportable.length, skipped })
        : t("playlist.exportDone", { count: exportable.length })
    );
  } catch (error) {
    console.error("导出 M3U 失败:", error);
    ElMessage.error(`${t("playlist.exportFailed")}: ${parseErrorMessage(error)}`);
  } finally {
    isExportingM3u.value = false;
  }
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

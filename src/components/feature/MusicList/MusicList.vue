<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Upload, Plus, Sort } from "@element-plus/icons-vue";
import TrashIcon from "@/components/base/icons/TrashIcon.vue";
import { deleteMusicFile } from "@/api/commands/file";
import { parseErrorMessage } from "@/utils/errorUtils";
import MultiSelectIcon from "@/components/base/icons/MultiSelectIcon.vue";
import type { MusicFile } from "@/types/model";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlayerStore } from "@/stores/playerStore";
import type { ContextMenuItem } from "@/composables/useContextMenu";
import { revealLocalFile } from "@/utils/revealInFolder";
import {
  LIBRARY_SORT_MODES,
  groupMusicFilesByAlbum,
  groupMusicFilesByArtist,
  type LibrarySortMode,
} from "@/utils/libraryGroups";
import { ElMessage } from "element-plus";
import { formatDurationLabel, getLocalMusicDisplayInfo } from "@/utils/songUtils";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { useRowSelection } from "@/composables/useRowSelection";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";
import TrackList from "@/components/feature/TrackList/TrackList.vue";
import EntityGrid from "@/components/feature/EntityGrid/EntityGrid.vue";
import type { EntityCardModel } from "@/components/feature/EntityGrid/types";
import type { TrackRowModel } from "@/components/feature/TrackList/types";

type BrowseTab = "songs" | "albums" | "artists";

const { t } = useI18n();
const playlistStore = usePlaylistStore();
const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();

/** 当前浏览方式；album/artist 下选中的分组 key（空表示在网格层级） */
const browseTab = ref<BrowseTab>("songs");
const selectedAlbumKey = ref<string | null>(null);
const selectedArtistKey = ref<string | null>(null);

function getFileKey(file: MusicFile): string {
  return file.relative_path || file.file_name;
}

const albumGroups = computed(() => groupMusicFilesByAlbum(props.musicFiles));
const artistGroups = computed(() => groupMusicFilesByArtist(props.musicFiles));

const selectedAlbum = computed(() =>
  selectedAlbumKey.value
    ? (albumGroups.value.find((group) => group.key === selectedAlbumKey.value) ?? null)
    : null
);
const selectedArtist = computed(() =>
  selectedArtistKey.value
    ? (artistGroups.value.find((group) => group.key === selectedArtistKey.value) ?? null)
    : null
);

/** 网格里选中分组后，列表与所有行操作都作用于该分组的曲目 */
const browseFiles = computed<MusicFile[]>(
  () => selectedAlbum.value?.tracks ?? selectedArtist.value?.tracks ?? props.musicFiles
);

/** 当前是否处于列表层级：歌曲页签，或网格里点开的分组详情 */
const isListView = computed(
  () =>
    browseTab.value === "songs" || Boolean(selectedAlbum.value || selectedArtist.value)
);

/** 分组详情页的头部信息；不在详情时头部仍显示整个曲库 */
const detailTitle = computed(() => {
  if (selectedAlbum.value) return selectedAlbum.value.name || t("common.unknownAlbum");
  if (selectedArtist.value) return selectedArtist.value.name || t("common.unknownArtist");
  return "";
});

const detailSubtitle = computed(() => {
  const minutes = (durationMs: number) => Math.round(durationMs / 60_000);
  if (selectedAlbum.value) {
    return t("musicList.summary", {
      count: selectedAlbum.value.tracks.length,
      minutes: minutes(selectedAlbum.value.durationMs),
    });
  }
  if (selectedArtist.value) {
    const group = selectedArtist.value;
    return t("musicList.artistSummary", {
      count: group.tracks.length,
      albums: group.albumCount,
      minutes: minutes(group.durationMs),
    });
  }
  return "";
});

const tabOptions = computed(() => [
  { label: t("musicList.tabSongs"), value: "songs" },
  { label: t("musicList.tabAlbums"), value: "albums" },
  { label: t("musicList.tabArtists"), value: "artists" },
]);

const sortOptions = LIBRARY_SORT_MODES;
const sortLabel = computed(() => t(`musicList.sort_${localStore.sortMode}`));

function handleSortCommand(mode: string) {
  localStore.setSortMode(mode as LibrarySortMode);
}

function openGroup(card: EntityCardModel) {
  clearSelection();
  if (browseTab.value === "albums") selectedAlbumKey.value = card.key;
  else if (browseTab.value === "artists") selectedArtistKey.value = card.key;
}

function closeGroup() {
  clearSelection();
  selectedAlbumKey.value = null;
  selectedArtistKey.value = null;
}

function switchTab(tab: BrowseTab) {
  closeGroup();
  browseTab.value = tab;
}

const selectedFiles = computed(() =>
  browseFiles.value.filter((file) => selectedKeys.value.has(getFileKey(file)))
);

const displayInfoByKey = computed(() => {
  const map = new Map<string, { title: string; artist: string; album?: string }>();
  for (const file of browseFiles.value) {
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
    /** 当前搜索词：曲库非空但没有命中时，空状态应说「没有匹配」而不是「曲库为空」 */
    searchKeyword?: string;
    /** 曲库加载/扫描失败的详情：有值时空状态展示错误与重试，而不是空的曲库 */
    errorMessage?: string;
  }>(),
  {
    showImportButton: false,
    loading: false,
    refreshing: false,
    getDefaultDirectory: () => null,
    searchKeyword: "",
    errorMessage: "",
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

const emit = defineEmits(["play", "toggle-current", "import", "retry"]);

// 分组数据换了（重新扫描/删除）时，正在看的分组可能已经不存在，自动退回网格。
// 必须放在 props 声明之后：watch 的取值函数在 setup 期间就会执行一次。
watch(
  () => props.musicFiles,
  () => {
    if (selectedAlbumKey.value && !selectedAlbum.value) selectedAlbumKey.value = null;
    if (selectedArtistKey.value && !selectedArtist.value) selectedArtistKey.value = null;
  }
);

const {
  selectionMode,
  selectedKeys,
  toggleSelectionMode,
  toggleSelectRow: toggleSelectKey,
  selectAll,
  deselectAll,
  clearSelection,
} = useRowSelection<string>({
  getSelectableKeys: () => browseFiles.value.map(getFileKey),
  getAvailableKeys: () => new Set(browseFiles.value.map(getFileKey)),
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

/**
 * 从曲库删除一首歌：音频文件连同它的封面与歌词一起删，不可撤销。
 *
 * 在这之前只能去访达里手动删——下载回来的歌只会越积越多。
 */
async function handleDelete(row: MusicFile) {
  try {
    await deleteMusicFile({
      fileName: row.file_name,
      defaultDirectory: localStore.defaultDirectory,
    });
    await localStore.refreshCurrentDirectory();
    ElMessage.success(t("musicList.deleted", { name: getDisplayInfo(row).title }));
  } catch (error) {
    console.error("删除歌曲失败:", error);
    ElMessage.error(`${t("errors.deleteMusicFailed")}: ${parseErrorMessage(error)}`);
  }
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

/** 行右键菜单：下一首播放 / 在文件夹中显示 / 从曲库删除。 */
function contextMenuItems(item: TrackRowModel): ContextMenuItem[] {
  const file = browseFiles.value[item.sourceIndex];
  if (!file) return [];
  return [
    {
      key: "play-next",
      label: t("contextMenu.playNext"),
      action: () => void playerStore.playNextInQueue({ type: "local", file }),
    },
    {
      key: "reveal",
      label: t("contextMenu.revealInFolder"),
      action: () => void revealLocalFile(file.file_name, localStore.currentDirectory),
    },
    {
      key: "delete",
      label: t("musicList.delete"),
      danger: true,
      action: () => void handleDelete(file),
    },
  ];
}

const trackRows = computed(() => browseFiles.value.map(toTrackRow));

function scheduleVisibleCovers(items: TrackRowModel[]) {
  scheduleCoverLoadMany(
    items
      .map((item) => browseFiles.value[item.sourceIndex])
      .filter((file): file is MusicFile => Boolean(file))
  );
}

/** 网格卡片：专辑按名称、歌手按头像；封面异步解析后经响应式缓存自动刷新 */
const groupCards = computed<EntityCardModel[]>(() => {
  if (browseTab.value === "albums") {
    return albumGroups.value.map((group) => ({
      key: group.key,
      kind: "album",
      title: group.name || t("common.unknownAlbum"),
      subtitle: group.artist || undefined,
      metaLabel: t("common.songCount", { count: group.tracks.length }),
      coverUrl: () => (group.coverFile ? getCover(group.coverFile) : ""),
    }));
  }
  if (browseTab.value === "artists") {
    return artistGroups.value.map((group) => ({
      key: group.key,
      kind: "artist",
      title: group.name || t("common.unknownArtist"),
      subtitle: t("common.albumCount", { count: group.albumCount }),
      metaLabel: t("common.songCount", { count: group.tracks.length }),
      coverUrl: () => (group.coverFile ? getCover(group.coverFile) : ""),
    }));
  }
  return [];
});

// 分组首曲的封面在切到网格时统一预取；响应式缓存到期后卡片会拿到占位图
watch(
  [browseTab, () => props.musicFiles],
  () => {
    const groups =
      browseTab.value === "albums"
        ? albumGroups.value
        : browseTab.value === "artists"
          ? artistGroups.value
          : [];
    scheduleCoverLoadMany(
      groups
        .map((group) => group.coverFile)
        .filter((file): file is MusicFile => Boolean(file))
    );
  },
  { immediate: true }
);
</script>

<template>
  <PageLayout class="music-list-container">
    <PageHeader
      :title="detailTitle || t('musicList.title')"
      :subtitle="detailTitle ? detailSubtitle : librarySubtitle"
    >
      <template #before-title>
        <button
          v-if="detailTitle"
          type="button"
          class="music-list__back"
          @click="closeGroup"
        >
          <span class="music-list__back-arrow" aria-hidden="true">‹</span>
          {{ t("common.back") }}
        </button>
      </template>
      <template #actions>
        <template v-if="selectionMode && isListView">
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
          <el-tooltip
            v-if="isListView"
            :content="t('musicList.multiSelect')"
            placement="bottom"
          >
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

    <!-- 浏览方式 + 排序：详情层级时让位给返回键与分组标题 -->
    <div v-if="!detailTitle" class="music-list__toolbar">
      <el-segmented
        :model-value="browseTab"
        :options="tabOptions"
        @update:model-value="switchTab($event as BrowseTab)"
      />
      <el-dropdown
        v-if="browseTab === 'songs'"
        trigger="click"
        @command="handleSortCommand"
      >
        <button
          type="button"
          class="music-list__sort"
          :aria-label="t('musicList.sortBy')"
        >
          <el-icon><Sort /></el-icon>
          <span>{{ sortLabel }}</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="mode in sortOptions" :key="mode" :command="mode">
              {{ t(`musicList.sort_${mode}`) }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <TrackList
      v-if="isListView"
      :items="trackRows"
      :loading="loading"
      :selection-mode="selectionMode"
      :selected-keys="selectedKeys"
      :current-key="currentKey"
      :is-playing="props.isPlaying"
      :context-menu-items="contextMenuItems"
      @activate="emit('play', browseFiles[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @toggle-select="toggleSelectRow(browseFiles[$event.sourceIndex])"
      @visible-items="scheduleVisibleCovers"
    >
      <template #loading>
        <el-skeleton :rows="6" animated />
      </template>
      <!-- 空状态分三种，别混成一句「曲库还是空的」：
           加载失败 → 报错 + 重试；搜索无命中 → 提示关键词；真为空 → 引导导入。 -->
      <template #empty>
        <el-empty
          v-if="errorMessage"
          :description="t('errors.loadMusicFailed')"
          :image-size="96"
        >
          <p class="music-list__empty-hint">{{ errorMessage }}</p>
          <el-button type="primary" @click="emit('retry')">
            {{ t("common.retry") }}
          </el-button>
        </el-empty>

        <el-empty
          v-else-if="searchKeyword.trim()"
          :description="t('musicList.noSearchResult', { keyword: searchKeyword.trim() })"
          :image-size="96"
        />

        <!-- 真·空曲库：动作放在用户正在读的那句话旁边。
             右上角的导入按钮只有一个 ↑ 图标，界面上没有「导入音乐」四个字，
             与其让用户去找，不如把按钮放在空状态里。 -->
        <el-empty v-else :description="t('musicList.empty')" :image-size="96">
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
            (cmd: string) => handleAddToPlaylist(cmd, browseFiles[item.sourceIndex])
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

        <!-- 删除要二次确认，而且文案必须写明「从磁盘删除、不可恢复」——
             这是全应用唯一会动用户文件的操作。 -->
        <el-popconfirm
          :title="t('musicList.deleteConfirm')"
          :confirm-button-text="t('common.confirmDelete')"
          :cancel-button-text="t('common.cancel')"
          width="300"
          trigger="click"
          @confirm="handleDelete(browseFiles[item.sourceIndex])"
        >
          <template #reference>
            <el-button
              circle
              size="small"
              link
              class="delete-action app-icon-button--danger"
              :icon="TrashIcon"
              :aria-label="t('musicList.delete')"
              @click.stop
            />
          </template>
        </el-popconfirm>
      </template>
    </TrackList>

    <!-- 专辑/歌手网格：不参与多选与排序，点开进入分组详情 -->
    <EntityGrid v-else :items="groupCards" :loading="loading" @activate="openGroup">
      <template #loading>
        <el-skeleton :rows="6" animated />
      </template>
      <template #empty>
        <el-empty
          v-if="errorMessage"
          :description="t('errors.loadMusicFailed')"
          :image-size="96"
        >
          <p class="music-list__empty-hint">{{ errorMessage }}</p>
          <el-button type="primary" @click="emit('retry')">
            {{ t("common.retry") }}
          </el-button>
        </el-empty>
        <el-empty
          v-else-if="searchKeyword.trim()"
          :description="t('musicList.noSearchResult', { keyword: searchKeyword.trim() })"
          :image-size="96"
        />
        <el-empty v-else :description="t('musicList.empty')" :image-size="96">
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
    </EntityGrid>
  </PageLayout>
</template>

<style scoped src="./MusicList.css" />

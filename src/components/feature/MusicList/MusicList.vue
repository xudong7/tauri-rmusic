<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Upload, Plus } from "@element-plus/icons-vue";
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
import { writeTrackDragPayload } from "@/utils/trackDrag";
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
const localStore = useLocalMusicStore();
const playerStore = usePlayerStore();

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

/** 拖到侧栏歌单即添加：载荷只带文件名，曲库是本地数据的唯一来源。 */
function handleRowDragStart(event: DragEvent, item: TrackRowModel) {
  const file = props.musicFiles[item.sourceIndex];
  if (!file) return;
  writeTrackDragPayload(event, { type: "local", fileName: file.file_name });
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
  const file = props.musicFiles[item.sourceIndex];
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
      :context-menu-items="contextMenuItems"
      @activate="emit('play', musicFiles[$event.sourceIndex])"
      @toggle-current="emit('toggle-current')"
      @toggle-select="toggleSelectRow(musicFiles[$event.sourceIndex])"
      @row-drag-start="handleRowDragStart"
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

        <!-- 删除要二次确认，而且文案必须写明「从磁盘删除、不可恢复」——
             这是全应用唯一会动用户文件的操作。 -->
        <el-popconfirm
          :title="t('musicList.deleteConfirm')"
          :confirm-button-text="t('common.confirmDelete')"
          :cancel-button-text="t('common.cancel')"
          width="300"
          trigger="click"
          @confirm="handleDelete(musicFiles[item.sourceIndex])"
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
  </PageLayout>
</template>

<style scoped src="./MusicList.css" />

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { i18n } from "@/i18n";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import { getScrollPosition, saveScrollPosition } from "@/composables/useScrollMemory";
import { useContextMenu, type ContextMenuItem } from "@/composables/useContextMenu";
import TrackRow from "./TrackRow.vue";
import type { TrackRowModel } from "./types";

const props = withDefaults(
  defineProps<{
    items: TrackRowModel[];
    selectionMode?: boolean;
    selectedKeys?: Set<string>;
    /** 操作簇要常驻的行 key（下载中/刚完成/待重试）。与 selectedKeys 同样
        只是个 key 集合，行的具体状态由槽内容自己表达。 */
    busyKeys?: Set<string>;
    loading?: boolean;
    nearEndThreshold?: number;
    /** 当前曲目的行 key；行的 is-current 样式由它与 item.key 比较得出，
        不烘焙进行对象里，播放/暂停时行模型数组可以保持同一份引用。 */
    currentKey?: string | null;
    /** 是否正在播放；只对 currentKey 那行生效。 */
    isPlaying?: boolean;
    /** 隐藏专辑列。给「已经在这张专辑里」的页面用——那里每一行的专辑列都写着
        页面标题本身，重复 N 遍还占着本该给歌名的宽度。 */
    hideAlbum?: boolean;
    /** 右键菜单项工厂。不传则行上没有右键菜单（如批量选择模式下的列表）。 */
    contextMenuItems?: (item: TrackRowModel) => ContextMenuItem[];
    /** 滚动位置记忆的键；空串表示不记忆 */
    scrollKey?: string;
    /** 列头是否可点击排序（只有本地曲库歌曲列表开启） */
    sortable?: boolean;
    /** 当前排序的列 key：高亮该列 */
    sortKey?: string;
    /** 行内歌手名可点（由调用方决定跳到哪） */
    artistClickable?: boolean;
    /** 行内专辑名可点 */
    albumClickable?: boolean;
    /** 行可拖拽重排（自建歌单用）。开启后行首多出拖拽手柄，列头同步让位。 */
    reorderable?: boolean;
  }>(),
  {
    selectionMode: false,
    selectedKeys: () => new Set<string>(),
    busyKeys: () => new Set<string>(),
    loading: false,
    nearEndThreshold: 220,
    currentKey: null,
    isPlaying: false,
    hideAlbum: false,
    contextMenuItems: undefined,
    scrollKey: "",
    sortable: false,
    sortKey: "",
    artistClickable: false,
    albumClickable: false,
    reorderable: false,
  }
);
const columnLabels = computed(() => {
  void i18n.global.locale.value;
  return {
    song: i18n.global.t("musicList.columnSong"),
    album: i18n.global.t("musicList.columnAlbum"),
    duration: i18n.global.t("musicList.columnDuration"),
  };
});

const emit = defineEmits<{
  activate: [item: TrackRowModel];
  toggleCurrent: [item: TrackRowModel];
  toggleSelect: [item: TrackRowModel];
  nearEnd: [];
  visibleItems: [items: TrackRowModel[]];
  sort: [key: string];
  /** 行内歌手 / 专辑名被点击，原样转给页面 */
  navigate: [kind: "artist" | "album", value: string, item: TrackRowModel];
  /** 拖拽重排完成：toIndex 是「移除该项之后」的插入下标（与 playlistStore 一致） */
  reorder: [fromIndex: number, toIndex: number];
}>();

/* ---------- 拖拽重排 ---------- */

/** 拖动中悬停在容器上下边缘时的自动滚动 */
const DRAG_EDGE_ZONE = 56;
const DRAG_EDGE_STEP = 16;

const draggingIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null);
const dropEdge = ref<"before" | "after">("before");

function handleDragStart(index: number) {
  draggingIndex.value = index;
}

function handleDragOver(index: number, edge: "before" | "after") {
  dropIndex.value = index;
  dropEdge.value = edge;
}

function resetDrag() {
  draggingIndex.value = null;
  dropIndex.value = null;
}

/**
 * 拖到某一行之前/之后，换算成「移除该项之后」的插入下标——
 * playlistStore.reorderPlaylist 就是这个语义（先 splice 掉再 splice 进）。
 */
function moveTarget(from: number, targetIndex: number, edge: "before" | "after") {
  const to = edge === "before" ? targetIndex : targetIndex + 1;
  return from < to ? to - 1 : to;
}

function handleDrop() {
  const from = draggingIndex.value;
  const target = dropIndex.value;
  const edge = dropEdge.value;
  resetDrag();
  if (from === null || target === null) return;
  const to = moveTarget(from, target, edge);
  if (to === from) return;
  emit("reorder", from, to);
}

/** 拖到列表上下边缘时自动滚动：虚拟滚动下新进入窗口的行才能成为落点 */
function handleContainerDragOver(event: DragEvent) {
  if (draggingIndex.value === null) return;
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (event.clientY < rect.top + DRAG_EDGE_ZONE) {
    container.scrollTop -= DRAG_EDGE_STEP;
  } else if (event.clientY > rect.bottom - DRAG_EDGE_ZONE) {
    container.scrollTop += DRAG_EDGE_STEP;
  }
}

function handleNavigate(kind: "artist" | "album", value: string, item: TrackRowModel) {
  emit("navigate", kind, value, item);
}

const itemsRef = computed(() => props.items);
const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight, scrollTo } =
  useVirtualListWhenLong<TrackRowModel>({ source: itemsRef });

const visibleItems = computed(() =>
  useVirtual.value ? virtualList.value.map(({ data }) => data) : props.items
);

watch(visibleItems, (items) => emit("visibleItems", items), { immediate: true });

function handleScroll(event: Event) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  saveScrollPosition(props.scrollKey, target.scrollTop);
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining < props.nearEndThreshold) emit("nearEnd");
}

/** 恢复滚动位置：虚拟列表按下标换算，普通列表直接写 scrollTop */
const standardScrollRef = ref<HTMLElement | null>(null);

function restoreScroll() {
  const top = getScrollPosition(props.scrollKey);
  if (top <= 0) return;
  if (useVirtual.value) {
    scrollTo(Math.floor(top / rowHeight));
  } else if (standardScrollRef.value) {
    standardScrollRef.value.scrollTop = top;
  }
}

onMounted(() => {
  void nextTick(restoreScroll);
});

watch(
  () => props.scrollKey,
  () => {
    void nextTick(restoreScroll);
  }
);

function handleActivate(item: TrackRowModel) {
  if (item.key === props.currentKey) emit("toggleCurrent", item);
  else emit("activate", item);
}

const contextMenu = useContextMenu();

function handleContextMenu(event: MouseEvent, item: TrackRowModel) {
  if (props.selectionMode || !props.contextMenuItems) return;
  contextMenu.open(event, props.contextMenuItems(item));
}

function handleListKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".track-row");
  const parent = target?.parentElement;
  if (!target || !parent) return;
  const rows = Array.from(parent.querySelectorAll<HTMLElement>(".track-row"));
  const currentIndex = rows.indexOf(target);
  if (currentIndex < 0) return;
  const nextIndex = currentIndex + (event.key === "ArrowDown" ? 1 : -1);
  const nextRow = rows[nextIndex];
  if (!nextRow) return;
  event.preventDefault();
  nextRow.focus();
}
</script>

<template>
  <div class="track-list">
    <slot name="before" />

    <div v-if="loading && items.length === 0" class="track-list__state">
      <slot name="loading" />
    </div>
    <div v-else-if="items.length === 0" class="track-list__state">
      <slot name="empty" />
    </div>

    <!-- 「歌曲」列头跨封面与标题两列，左边沿因此落在封面左边缘，与行里的
         封面左对齐（而不是缩进到歌名文字的位置）。专辑、时长各占一列，
         由下面 CSS 里的 grid-column 钉死。 -->
    <div
      v-if="items.length > 0"
      class="track-list__columns"
      :class="{ 'is-album-hidden': hideAlbum, 'is-reorderable': reorderable }"
      :aria-hidden="sortable ? undefined : 'true'"
    >
      <span class="track-list__column-song" :role="sortable ? 'columnheader' : undefined">
        <button
          v-if="sortable"
          type="button"
          class="track-list__column-btn"
          :class="{ 'is-active': sortKey === 'title' }"
          @click="emit('sort', 'title')"
        >
          {{ columnLabels.song }}
        </button>
        <template v-else>{{ columnLabels.song }}</template>
      </span>
      <span
        v-if="!hideAlbum"
        class="track-list__column-album"
        :role="sortable ? 'columnheader' : undefined"
      >
        <button
          v-if="sortable"
          type="button"
          class="track-list__column-btn"
          :class="{ 'is-active': sortKey === 'album' }"
          @click="emit('sort', 'album')"
        >
          {{ columnLabels.album }}
        </button>
        <template v-else>{{ columnLabels.album }}</template>
      </span>
      <span
        class="track-list__column-duration"
        :role="sortable ? 'columnheader' : undefined"
      >
        <button
          v-if="sortable"
          type="button"
          class="track-list__column-btn"
          :class="{ 'is-active': sortKey === 'duration' }"
          @click="emit('sort', 'duration')"
        >
          {{ columnLabels.duration }}
        </button>
        <template v-else>{{ columnLabels.duration }}</template>
      </span>
    </div>

    <div
      v-if="items.length > 0 && useVirtual"
      v-bind="containerProps"
      class="track-list__scroll track-list__scroll--virtual"
      data-render-mode="virtual"
      :tabindex="0"
      @scroll.passive="handleScroll"
      @keydown="handleListKeydown"
      @dragover="handleContainerDragOver"
    >
      <div v-bind="wrapperProps" class="track-list__rows" role="list">
        <TrackRow
          v-for="{ data: item, index } in virtualList"
          :key="item.key"
          :item="item"
          :index="index"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          :is-current="item.key === currentKey"
          :is-playing="isPlaying && item.key === currentKey"
          :busy="busyKeys.has(item.key)"
          :hide-album="hideAlbum"
          :row-height="rowHeight"
          :artist-clickable="artistClickable"
          :album-clickable="albumClickable"
          :reorderable="reorderable"
          :dragging="draggingIndex !== null"
          :drop-indicator="dropIndex === index ? dropEdge : null"
          @activate="handleActivate"
          @toggle-select="emit('toggleSelect', $event)"
          @context-menu="handleContextMenu"
          @navigate="handleNavigate"
          @drag-start="handleDragStart(index)"
          @drag-over="handleDragOver(index, $event)"
          @drop="handleDrop"
          @drag-end="resetDrag"
        >
          <template v-if="$slots.actions" #actions="{ item: actionItem }">
            <slot name="actions" :item="actionItem" />
          </template>
        </TrackRow>
      </div>
    </div>

    <div
      v-else-if="items.length > 0"
      ref="standardScrollRef"
      class="track-list__scroll"
      data-render-mode="standard"
      @scroll.passive="handleScroll"
      @keydown="handleListKeydown"
      @dragover="handleContainerDragOver"
    >
      <div class="track-list__rows" role="list">
        <TrackRow
          v-for="(item, index) in items"
          :key="item.key"
          :item="item"
          :index="index"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          :is-current="item.key === currentKey"
          :is-playing="isPlaying && item.key === currentKey"
          :busy="busyKeys.has(item.key)"
          :hide-album="hideAlbum"
          :artist-clickable="artistClickable"
          :album-clickable="albumClickable"
          :reorderable="reorderable"
          :dragging="draggingIndex !== null"
          :drop-indicator="dropIndex === index ? dropEdge : null"
          @activate="handleActivate"
          @toggle-select="emit('toggleSelect', $event)"
          @context-menu="handleContextMenu"
          @navigate="handleNavigate"
          @drag-start="handleDragStart(index)"
          @drag-over="handleDragOver(index, $event)"
          @drop="handleDrop"
          @drag-end="resetDrag"
        >
          <template v-if="$slots.actions" #actions="{ item: actionItem }">
            <slot name="actions" :item="actionItem" />
          </template>
        </TrackRow>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.track-list__scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* 行与列头都不再限宽居中：整块贴着内容区左边缘，与页面标题同一条竖线。
   行盒铺满整行（底色、悬停、条纹照旧横贯），里面的网格也铺满，只在右侧
   留出 --app-track-end-gap 的空档，让时长列不贴边；窗口拉宽时由歌名与专辑
   两列分掉新增的宽度。
   过去这里有一条 max-width + margin-inline: auto，把列表居中成一条 1080px
   的窄带，两侧各留一大块空白，和页面标题完全对不上。 */
.track-list__rows {
  width: 100%;
  padding: 0 4px 12px;
  box-sizing: border-box;
}

.track-list__columns {
  /* 列头不在滚动容器里，宽度要自己扣两笔才与行的网格区同宽同起点：
       · 4px —— 滚动条槽位（下面的滚动容器有 scrollbar-gutter: stable，
         实宽取自 themes.css 的 ::-webkit-scrollbar）
       · 4px —— 行的容器内边距（.track-list__rows 左右各 4px）
       · 再左移 4px 把那两个内边距补回来，让两者的左边缘重合
     两笔都算上，右对齐的时长才会与行里的时长落在同一条竖线上。 */
  width: calc(100% - 12px);
  margin-left: 4px;
  min-height: 32px;
  /* 右侧空档必须与行里那笔一模一样，否则「时长」这个标题对不上列里的数字 */
  padding: 0 calc(var(--app-track-row-padding-x) + var(--app-track-end-gap)) 0
    var(--app-track-row-padding-x);
  display: grid;
  grid-template-columns: var(--app-track-grid);
  align-items: center;
  gap: var(--app-track-row-gap);
  box-sizing: border-box;
  border-bottom: 1px solid var(--app-surface-border);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 550;
  letter-spacing: 0.02em;
}

.track-list__columns.is-album-hidden {
  grid-template-columns: var(--app-track-grid-compact);
}

/* 可重排时最前面多一格拖拽手柄：必须与 .track-row.is-reorderable 同步加，
   否则列头与行的网格错开一格 */
.track-list__columns.is-reorderable {
  grid-template-columns: var(--app-track-drag-column) var(--app-track-grid);
}

.track-list__columns.is-album-hidden.is-reorderable {
  grid-template-columns: var(--app-track-drag-column) var(--app-track-grid-compact);
}

/* 歌曲列头原本跨封面 + 标题两轨，多一格手柄后顺延到 2 / 4 */
.track-list__columns.is-reorderable .track-list__column-song {
  grid-column: 2 / 4;
}

.track-list__column-song {
  /* 跨封面与标题两列：起点与行里封面的左边缘同一条竖线。
     隐藏专辑列时网格只剩三轨，这个 1/3 仍然正好是封面 + 歌名。 */
  grid-column: 1 / 3;
}

.track-list__column-duration {
  /* 与行里的时长同理：钉住最后一格，且必须写成线到线的区间。
     单个 -1 是最后一条线，会让这一格落到显式网格之外，凭空多出一格。 */
  grid-column: -2 / -1;
  text-align: right;
}

/* 可排序时的列头按钮：外观与普通列头一致，悬停变色 */
.track-list__column-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  transition: color var(--app-control-transition);
}

.track-list__column-btn:hover,
.track-list__column-btn.is-active {
  color: var(--el-color-primary);
}

.track-list__state {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 没有窄屏变体：列头与行共用 --app-track-grid，那份网格在任何窗口宽度下都
   放得下（见 themes.css 里的推导），所以缩窄不需要收起专辑列，也就不会重排。 */
</style>

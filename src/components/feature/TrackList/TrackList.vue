<script setup lang="ts">
import { computed, watch } from "vue";
import { i18n } from "@/i18n";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import TrackRow from "./TrackRow.vue";
import type { TrackRowModel } from "./types";

const props = withDefaults(
  defineProps<{
    items: TrackRowModel[];
    selectionMode?: boolean;
    selectedKeys?: Set<string>;
    loading?: boolean;
    nearEndThreshold?: number;
  }>(),
  {
    selectionMode: false,
    selectedKeys: () => new Set<string>(),
    loading: false,
    nearEndThreshold: 220,
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
}>();

const itemsRef = computed(() => props.items);
const { useVirtual, virtualList, containerProps, wrapperProps, rowHeight } =
  useVirtualListWhenLong<TrackRowModel>({ source: itemsRef });

const visibleItems = computed(() =>
  useVirtual.value ? virtualList.value.map(({ data }) => data) : props.items
);

watch(visibleItems, (items) => emit("visibleItems", items), { immediate: true });

function handleScroll(event: Event) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining < props.nearEndThreshold) emit("nearEnd");
}

function handleActivate(item: TrackRowModel) {
  if (item.isCurrent) emit("toggleCurrent", item);
  else emit("activate", item);
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

    <!-- 格数必须与 TrackRow 的网格一致：多一格空 span 就会把「歌曲」推到
         歌名右边 52px。这里只有 4 格——封面、歌名、专辑、时长。 -->
    <div v-if="items.length > 0" class="track-list__columns" aria-hidden="true">
      <span />
      <span class="track-list__column-song">{{ columnLabels.song }}</span>
      <span class="track-list__column-album">{{ columnLabels.album }}</span>
      <span class="track-list__column-duration">{{ columnLabels.duration }}</span>
    </div>

    <div
      v-if="items.length > 0 && useVirtual"
      v-bind="containerProps"
      class="track-list__scroll track-list__scroll--virtual"
      data-render-mode="virtual"
      @scroll.passive="handleScroll"
      @keydown="handleListKeydown"
    >
      <div v-bind="wrapperProps" class="track-list__rows" role="list">
        <TrackRow
          v-for="{ data: item, index } in virtualList"
          :key="item.key"
          :item="item"
          :index="index"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          :row-height="rowHeight"
          @activate="handleActivate"
          @toggle-select="emit('toggleSelect', $event)"
        >
          <template v-if="$slots.actions" #actions="{ item: actionItem }">
            <slot name="actions" :item="actionItem" />
          </template>
        </TrackRow>
      </div>
    </div>

    <div
      v-else-if="items.length > 0"
      class="track-list__scroll"
      data-render-mode="standard"
      @scroll.passive="handleScroll"
      @keydown="handleListKeydown"
    >
      <div class="track-list__rows" role="list">
        <TrackRow
          v-for="(item, index) in items"
          :key="item.key"
          :item="item"
          :index="index"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          @activate="handleActivate"
          @toggle-select="emit('toggleSelect', $event)"
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

.track-list__column-duration {
  /* 与行里的时长同理：钉住最后一格，且必须写成线到线的区间。
     单个 -1 是最后一条线，会让这一格落到显式网格之外，凭空多出一格。 */
  grid-column: -2 / -1;
  text-align: right;
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

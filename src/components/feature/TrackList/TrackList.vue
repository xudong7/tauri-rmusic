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
    width?: "reading" | "online";
    nearEndThreshold?: number;
  }>(),
  {
    selectionMode: false,
    selectedKeys: () => new Set<string>(),
    loading: false,
    width: "reading",
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
  intent: [item: TrackRowModel];
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
  <div class="track-list" :class="`track-list--${width}`">
    <slot name="before" />

    <div v-if="loading && items.length === 0" class="track-list__state">
      <slot name="loading" />
    </div>
    <div v-else-if="items.length === 0" class="track-list__state">
      <slot name="empty" />
    </div>

    <div v-if="items.length > 0" class="track-list__columns" aria-hidden="true">
      <span />
      <span />
      <span class="track-list__column-song">{{ columnLabels.song }}</span>
      <span class="track-list__column-album">{{ columnLabels.album }}</span>
      <span class="track-list__column-duration">{{ columnLabels.duration }}</span>
      <span />
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
          v-for="{ data: item } in virtualList"
          :key="item.key"
          :item="item"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          :row-height="rowHeight"
          @activate="handleActivate"
          @intent="emit('intent', $event)"
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
          v-for="item in items"
          :key="item.key"
          :item="item"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          @activate="handleActivate"
          @intent="emit('intent', $event)"
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

.track-list__rows {
  width: 100%;
  padding: 0 4px 12px;
  box-sizing: border-box;
  margin-inline: auto;
}

.track-list__columns {
  width: calc(100% - 8px);
  min-height: 32px;
  margin-inline: auto;
  padding: 0 var(--app-track-row-padding-x);
  display: grid;
  grid-template-columns: 36px 44px minmax(180px, 1fr) minmax(140px, 220px) 48px 34px;
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
  text-align: right;
}

.track-list--reading .track-list__rows {
  max-width: var(--app-list-reading-width);
}

.track-list--reading .track-list__columns {
  max-width: var(--app-list-reading-width);
}

.track-list--online .track-list__rows {
  max-width: var(--app-online-list-width);
}

.track-list--online .track-list__columns {
  max-width: var(--app-online-list-width);
  grid-template-columns: 36px 44px minmax(180px, 1fr) minmax(140px, 220px) 48px 76px;
}

.track-list__state {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1100px) {
  .track-list__columns {
    grid-template-columns: 36px 44px minmax(0, 1fr) 48px 34px;
  }

  .track-list--online .track-list__columns {
    grid-template-columns: 36px 44px minmax(0, 1fr) 48px 76px;
  }

  .track-list__column-album {
    display: none;
  }

  .track-list__column-duration {
    grid-column: 4;
  }
}

@media (max-width: 840px) {
  .track-list__columns {
    grid-template-columns: 32px 44px minmax(0, 1fr) 44px 32px;
    gap: 10px;
  }

  .track-list--online .track-list__columns {
    grid-template-columns: 32px 44px minmax(0, 1fr) 44px 76px;
  }
}
</style>

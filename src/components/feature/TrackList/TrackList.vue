<script setup lang="ts">
import { computed, watch } from "vue";
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

const emit = defineEmits<{
  activate: [item: TrackRowModel];
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

    <div
      v-else-if="useVirtual"
      v-bind="containerProps"
      class="track-list__scroll track-list__scroll--virtual"
      data-render-mode="virtual"
      @scroll.passive="handleScroll"
    >
      <div v-bind="wrapperProps" class="track-list__rows">
        <TrackRow
          v-for="{ data: item } in virtualList"
          :key="item.key"
          :item="item"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          :row-height="rowHeight"
          @activate="emit('activate', $event)"
          @toggle-select="emit('toggleSelect', $event)"
        >
          <template v-if="$slots.actions" #actions="{ item: actionItem }">
            <slot name="actions" :item="actionItem" />
          </template>
        </TrackRow>
      </div>
    </div>

    <div
      v-else
      class="track-list__scroll"
      data-render-mode="standard"
      @scroll.passive="handleScroll"
    >
      <div class="track-list__rows">
        <TrackRow
          v-for="item in items"
          :key="item.key"
          :item="item"
          :selection-mode="selectionMode"
          :selected="selectedKeys.has(item.key)"
          @activate="emit('activate', $event)"
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
}

.track-list--reading .track-list__rows {
  max-width: var(--app-list-reading-width);
}

.track-list--online .track-list__rows {
  max-width: var(--app-online-list-width);
}

.track-list__state {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

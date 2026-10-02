<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { GRID_NEAR_END_THRESHOLD } from "@/constants";
import { getScrollPosition, saveScrollPosition } from "@/composables/useScrollMemory";
import EntityCard from "./EntityCard.vue";
import type { EntityCardModel } from "./types";

const props = withDefaults(
  defineProps<{
    items: EntityCardModel[];
    loading?: boolean;
    nearEndThreshold?: number;
    /** 滚动位置记忆的键；空串表示不记忆 */
    scrollKey?: string;
  }>(),
  {
    loading: false,
    nearEndThreshold: GRID_NEAR_END_THRESHOLD,
    scrollKey: "",
  }
);

const emit = defineEmits<{
  activate: [item: EntityCardModel];
  nearEnd: [];
}>();

// 与 TrackList.handleScroll 同一套触底判定。这里不做 2D 虚拟化：
// 卡片数量由调用方以 MAX_GRID_ITEMS 设上限，比手写二维虚拟化更划算。
const scrollRef = ref<HTMLElement | null>(null);

function handleScroll(event: Event) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  saveScrollPosition(props.scrollKey, target.scrollTop);
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining < props.nearEndThreshold) emit("nearEnd");
}

function restoreScroll() {
  const top = getScrollPosition(props.scrollKey);
  if (top <= 0 || !scrollRef.value) return;
  scrollRef.value.scrollTop = top;
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
</script>

<template>
  <div class="entity-grid" :data-render-mode="items.length > 0 ? 'grid' : 'empty'">
    <slot name="before" />

    <div v-if="loading && items.length === 0" class="entity-grid__state">
      <slot name="loading" />
    </div>
    <div v-else-if="items.length === 0" class="entity-grid__state">
      <slot name="empty" />
    </div>

    <div
      v-else
      ref="scrollRef"
      class="entity-grid__scroll"
      @scroll.passive="handleScroll"
    >
      <div class="entity-grid__items">
        <EntityCard
          v-for="item in items"
          :key="item.key"
          :item="item"
          @activate="emit('activate', $event)"
        />
      </div>
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped src="./EntityGrid.css" />

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Close, Headset, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";
import type { PlaybackQueueItem } from "@/types/model";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import { QUEUE_ROW_HEIGHT } from "@/constants";

const { t } = useI18n();
const props = defineProps<{
  items: PlaybackQueueItem[];
  title: string;
  isPlaying: boolean;
}>();
const emit = defineEmits<{
  close: [];
  play: [index: number];
}>();

const panelRef = ref<HTMLElement | null>(null);
const currentIndex = computed(() => props.items.findIndex((item) => item.isCurrent));
const currentPosition = computed(() =>
  currentIndex.value >= 0 ? currentIndex.value + 1 : 0
);

// 没有显式队列时，playbackQueueItems 会退化成整个本地曲库，
// 裸 v-for 会在一次 patch 里建出成千上万个节点。行高固定，适合虚拟化。
const itemsRef = computed(() => props.items);
const { useVirtual, virtualList, scrollTo, containerProps, wrapperProps } =
  useVirtualListWhenLong<PlaybackQueueItem>({
    source: itemsRef,
    itemHeight: QUEUE_ROW_HEIGHT,
  });

onMounted(async () => {
  await nextTick();
  panelRef.value?.focus();
  if (currentIndex.value < 0) return;
  if (!useVirtual.value) {
    panelRef.value?.querySelector<HTMLElement>(".is-current")?.scrollIntoView({
      block: "center",
    });
    return;
  }
  // 虚拟化后当前曲目通常不在 DOM 里，scrollIntoView 会静默失效，必须按索引滚。
  // scrollTo 把目标行对齐到容器顶部，这里减去半屏，保持与上面 block:"center" 一致。
  const viewportHeight = containerProps.ref.value?.clientHeight ?? 0;
  const half = Math.floor(viewportHeight / QUEUE_ROW_HEIGHT / 2);
  scrollTo(Math.max(0, currentIndex.value - half));
});

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  if (event.key !== "Tab" || !panelRef.value) return;
  const focusable = Array.from(
    panelRef.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    )
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div class="queue-layer" @click.self="emit('close')">
    <aside
      ref="panelRef"
      class="queue-panel"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="t('playerBar.queue')"
      @keydown="handlePanelKeydown"
    >
      <header class="queue-header">
        <div class="queue-heading">
          <h2>{{ t("playerBar.queue") }}</h2>
          <p>
            {{ title || t("playerBar.currentQueue") }}
            <span v-if="items.length">· {{ currentPosition }}/{{ items.length }}</span>
          </p>
        </div>
        <button
          type="button"
          class="queue-close app-header-icon-button"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <div
        v-if="items.length && useVirtual"
        v-bind="containerProps"
        class="queue-list"
        data-render-mode="virtual"
      >
        <div v-bind="wrapperProps" class="queue-rows" role="list">
          <button
            v-for="{ data: item } in virtualList"
            :key="item.key"
            type="button"
            class="queue-item"
            :class="{ 'is-current': item.isCurrent }"
            :style="{
              height: `${QUEUE_ROW_HEIGHT}px`,
              minHeight: `${QUEUE_ROW_HEIGHT}px`,
            }"
            :disabled="item.disabled"
            :aria-current="item.isCurrent ? 'true' : undefined"
            @click="emit('play', item.sourceIndex)"
          >
            <span class="queue-item-index">
              <el-icon v-if="item.isCurrent">
                <VideoPause v-if="isPlaying" />
                <VideoPlay v-else />
              </el-icon>
              <span v-else>{{ item.sourceIndex + 1 }}</span>
            </span>
            <span class="queue-item-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.artist }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-else-if="items.length" class="queue-list" data-render-mode="standard">
        <div class="queue-rows" role="list">
          <button
            v-for="item in items"
            :key="item.key"
            type="button"
            class="queue-item"
            :class="{ 'is-current': item.isCurrent }"
            :disabled="item.disabled"
            :aria-current="item.isCurrent ? 'true' : undefined"
            @click="emit('play', item.sourceIndex)"
          >
            <span class="queue-item-index">
              <el-icon v-if="item.isCurrent">
                <VideoPause v-if="isPlaying" />
                <VideoPlay v-else />
              </el-icon>
              <span v-else>{{ item.sourceIndex + 1 }}</span>
            </span>
            <span class="queue-item-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.artist }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-else class="queue-empty">
        <el-icon><Headset /></el-icon>
        <p>{{ t("playerBar.queueEmpty") }}</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.queue-layer {
  position: fixed;
  inset: var(--app-header-height) 0 var(--app-player-height) 0;
  z-index: 180;
  display: flex;
  justify-content: flex-end;
  background: var(--app-overlay-scrim);
}

.queue-panel {
  width: min(350px, calc(100vw - 32px));
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
  background: var(--app-overlay-panel-bg);
  border-left: 1px solid var(--app-surface-border);
  box-shadow: var(--app-overlay-panel-shadow);
  outline: none;
}

.queue-header {
  min-height: 64px;
  padding: 10px 12px 9px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--app-surface-border);
}

.queue-heading {
  min-width: 0;
}

.queue-heading h2,
.queue-heading p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-heading h2 {
  font-size: 16px;
  font-weight: 650;
}

.queue-heading p {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.queue-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--app-radius-full);
  color: var(--el-text-color-regular);
  background: transparent;
  cursor: pointer;
}

.queue-close:hover {
  color: var(--el-color-primary);
  background: var(--hover-bg-color);
}

.queue-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  /* 与 TrackList / EntityGrid 保持一致：内容从不可滚动变为可滚动时，
     预留的滚动条槽位能避免整列横向跳动。 */
  scrollbar-gutter: stable;
  scroll-padding-block: 8px;
}

/* 内边距放在包裹层而非滚动容器上：虚拟滚动用 scrollTop 算行偏移，
   容器上的 padding 会让每行实际位置与计算值差一个固定量。 */
.queue-rows {
  padding: 6px;
  box-sizing: border-box;
}

.queue-item {
  width: 100%;
  min-height: 46px;
  padding: 6px 8px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.queue-item:hover,
.queue-item:focus-visible {
  background: var(--hover-bg-color);
  outline: none;
}

.queue-item.is-current {
  color: var(--el-color-primary);
  background: var(--active-item-bg);
}

.queue-item:disabled {
  opacity: 0.48;
  cursor: default;
}

.queue-item-index {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.queue-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-item-main strong,
.queue-item-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item-main strong {
  font-size: 13px;
  font-weight: 600;
}

.queue-item-main span {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.queue-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
}

.queue-empty .el-icon {
  font-size: 28px;
}

.queue-empty p {
  margin: 0;
  font-size: 13px;
}

@media (prefers-reduced-motion: no-preference) {
  .queue-panel {
    animation: queue-slide-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

@keyframes queue-slide-in {
  from {
    opacity: 0;
    transform: translateX(22px);
  }
}
</style>

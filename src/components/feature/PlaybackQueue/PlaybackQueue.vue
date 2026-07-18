<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Close, Headset, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";
import type { PlaybackQueueItem } from "@/types/model";

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
const currentPosition = computed(() => {
  const index = props.items.findIndex((item) => item.isCurrent);
  return index >= 0 ? index + 1 : 0;
});

onMounted(async () => {
  await nextTick();
  panelRef.value?.focus();
  panelRef.value?.querySelector<HTMLElement>(".is-current")?.scrollIntoView({
    block: "center",
  });
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

      <div v-if="items.length" class="queue-list">
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
          <span class="queue-item-source">
            {{ t(item.source === "local" ? "common.localMusic" : "onlineMusic.title") }}
          </span>
        </button>
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
  background: rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(2px);
}

.queue-panel {
  width: min(390px, calc(100vw - 32px));
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--app-card-bg) 94%, transparent);
  border-left: 1px solid var(--app-surface-border);
  box-shadow: -18px 0 50px rgba(15, 23, 42, 0.12);
  outline: none;
}

.queue-header {
  min-height: 72px;
  padding: 14px 16px 12px 20px;
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
  font-size: 17px;
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
  border-radius: 50%;
  color: var(--el-text-color-secondary);
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
  padding: 8px;
  overflow-y: auto;
}

.queue-item {
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
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
  gap: 3px;
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

.queue-item-main span,
.queue-item-source {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.queue-item-source {
  max-width: 74px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

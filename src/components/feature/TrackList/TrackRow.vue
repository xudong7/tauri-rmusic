<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { CaretRight } from "@element-plus/icons-vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import type { TrackRowModel } from "./types";

const props = withDefaults(
  defineProps<{
    item: TrackRowModel;
    selectionMode?: boolean;
    selected?: boolean;
    rowHeight?: number;
  }>(),
  {
    selectionMode: false,
    selected: false,
    rowHeight: undefined,
  }
);

const emit = defineEmits<{
  activate: [item: TrackRowModel];
  intent: [item: TrackRowModel];
  toggleSelect: [item: TrackRowModel];
}>();

let intentTimer: number | null = null;

const resolvedCoverUrl = computed(() =>
  typeof props.item.coverUrl === "function" ? props.item.coverUrl() : props.item.coverUrl
);

function handleRowClick() {
  cancelIntent();
  if (props.selectionMode) {
    emit("toggleSelect", props.item);
    return;
  }
  handleActivate();
}

function scheduleIntent() {
  if (props.selectionMode || props.item.disabled || intentTimer !== null) return;
  intentTimer = window.setTimeout(() => {
    intentTimer = null;
    emit("intent", props.item);
  }, 180);
}

function cancelIntent() {
  if (intentTimer === null) return;
  clearTimeout(intentTimer);
  intentTimer = null;
}

onBeforeUnmount(cancelIntent);

function handleActivate() {
  if (props.selectionMode || props.item.disabled) return;
  emit("activate", props.item);
}
</script>

<template>
  <div
    class="track-row"
    :class="{
      'track-row--online': item.source === 'online',
      'is-current': item.isCurrent && !selectionMode,
      'is-selected': selected,
      'is-disabled': item.disabled,
    }"
    :style="
      rowHeight ? { height: `${rowHeight}px`, minHeight: `${rowHeight}px` } : undefined
    "
    :title="`${item.title} — ${item.artist}`"
    :tabindex="item.disabled ? -1 : 0"
    role="listitem"
    :aria-current="item.isCurrent ? 'true' : undefined"
    :aria-disabled="item.disabled || undefined"
    @click="handleRowClick"
    @keydown.enter.self.prevent="handleRowClick"
    @keydown.space.self.prevent="handleRowClick"
    @pointerenter="scheduleIntent"
    @pointerleave="cancelIntent"
  >
    <div class="track-row__play">
      <el-checkbox
        v-if="selectionMode"
        :model-value="selected"
        :aria-label="item.title"
        @click.stop
        @change="emit('toggleSelect', item)"
      />
      <button
        v-else
        type="button"
        class="track-row__play-button"
        :class="{ 'is-current': item.isCurrent }"
        :disabled="item.disabled"
        :aria-label="item.title"
        @click.stop="
          cancelIntent();
          handleActivate();
        "
      >
        <span v-if="item.isCurrent && item.isPlaying" class="track-row__equalizer">
          <i />
          <i />
          <i />
        </span>
        <el-icon v-else class="track-row__play-icon"><CaretRight /></el-icon>
        <span v-if="!item.isCurrent" class="track-row__index">{{
          item.sourceIndex + 1
        }}</span>
      </button>
    </div>

    <div class="track-row__cover">
      <CoverImage :src="resolvedCoverUrl" alt="" :size="44" :radius="7" />
    </div>

    <div class="track-row__main">
      <div class="track-row__title" :class="{ 'is-playing': item.isCurrent }">
        {{ item.title }}
      </div>
      <div class="track-row__meta">
        {{ item.artist
        }}<span v-if="item.album" class="track-row__meta-album"> · {{ item.album }}</span>
      </div>
    </div>

    <div v-if="item.album" class="track-row__album" :title="item.album">
      {{ item.album }}
    </div>

    <div v-if="item.durationLabel" class="track-row__duration">
      {{ item.durationLabel }}
    </div>

    <div v-if="$slots.actions && !selectionMode" class="track-row__actions" @click.stop>
      <slot name="actions" :item="item" />
    </div>
  </div>
</template>

<style scoped>
.track-row {
  position: relative;
  min-height: var(--app-track-row-height);
  margin-bottom: 0;
  padding: var(--app-track-row-padding-y) var(--app-track-row-padding-x);
  display: grid;
  grid-template-columns: 36px 44px minmax(180px, 1fr) minmax(140px, 220px) 48px 34px;
  align-items: center;
  gap: var(--app-track-row-gap);
  box-sizing: border-box;
  border-radius: var(--app-radius-md);
  cursor: pointer;
  transition:
    background var(--app-control-transition),
    color var(--app-control-transition);
  outline: none;
}

.track-row:hover {
  background: var(--hover-bg-color);
}

.track-row.is-current,
.track-row.is-selected {
  background: var(--active-item-bg);
}

.track-row.is-current {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.track-row:focus-visible {
  background: var(--hover-bg-color);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 52%, transparent);
}

.track-row.is-current::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 50%;
  border-radius: 0 var(--app-radius-full) var(--app-radius-full) 0;
  background: var(--el-color-primary);
  transform: translateY(-50%);
}

.track-row.is-disabled {
  cursor: default;
  opacity: 0.5;
}

.track-row__play,
.track-row__cover,
.track-row__album,
.track-row__duration,
.track-row__actions {
  flex-shrink: 0;
}

.track-row__play {
  grid-column: 1;
}

.track-row__cover {
  grid-column: 2;
}

.track-row__main {
  grid-column: 3;
}

.track-row__album {
  grid-column: 4;
  width: clamp(140px, 20vw, 260px);
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-row__cover {
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: var(--app-radius-sm);
}

.track-row__main {
  flex: 1;
  min-width: 0;
}

.track-row__title,
.track-row__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0;
}

.track-row__meta-album {
  display: none;
}

.track-row__title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.track-row__title.is-playing {
  color: var(--el-color-primary);
  font-weight: 600;
}

.track-row__meta {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.track-row__duration {
  grid-column: 5;
  min-width: 40px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.track-row__actions {
  grid-column: 6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--app-control-transition);
}

.track-row--online {
  grid-template-columns: 36px 44px minmax(180px, 1fr) minmax(140px, 220px) 48px 76px;
}

.track-row:hover .track-row__actions,
.track-row:focus-within .track-row__actions {
  opacity: 1;
  pointer-events: auto;
}

:deep(.track-row__actions .el-button) {
  width: var(--list-row-btn-size);
  height: var(--list-row-btn-size);
  padding: 0;
  border: 1px solid transparent;
  color: var(--app-icon-button-color);
  background: transparent;
  transition:
    background var(--app-control-transition),
    border-color var(--app-control-transition),
    color var(--app-control-transition),
    transform var(--app-control-transition),
    box-shadow var(--app-control-transition);
}

:deep(.track-row__actions .el-button:hover) {
  color: var(--app-icon-button-hover-color);
  border-color: var(--app-button-border);
  background: var(--app-icon-button-hover-bg);
}

.track-row__play-button {
  position: relative;
  width: var(--list-row-btn-size);
  height: var(--list-row-btn-size);
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--app-radius-full);
  color: var(--el-text-color-secondary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  transition:
    color var(--app-control-transition),
    background var(--app-control-transition),
    transform var(--app-control-transition);
}

.track-row__play-button:hover,
.track-row__play-button:focus-visible,
.track-row__play-button.is-current {
  color: var(--el-color-primary);
  background: var(--app-icon-button-hover-bg);
  outline: none;
}

.track-row__play-icon {
  position: absolute;
  opacity: 0;
  font-size: 15px;
}

.track-row:hover .track-row__play-icon,
.track-row:focus-within .track-row__play-icon,
.track-row__play-button.is-current .track-row__play-icon {
  opacity: 1;
}

.track-row:hover .track-row__index,
.track-row:focus-within .track-row__index {
  opacity: 0;
}

.track-row__equalizer {
  width: 16px;
  height: 15px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
}

.track-row__equalizer i {
  width: 2px;
  border-radius: var(--app-radius-full);
  background: currentColor;
  animation: track-equalizer 0.8s ease-in-out infinite alternate;
}

.track-row__equalizer i:nth-child(1) {
  height: 8px;
  animation-delay: -0.45s;
}

.track-row__equalizer i:nth-child(2) {
  height: 14px;
  animation-delay: -0.2s;
}

.track-row__equalizer i:nth-child(3) {
  height: 10px;
  animation-delay: -0.65s;
}

@keyframes track-equalizer {
  to {
    height: 4px;
  }
}

@media (hover: none) {
  .track-row__actions {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (max-width: 1100px) {
  .track-row__album {
    display: none;
  }

  .track-row {
    grid-template-columns: 36px 44px minmax(0, 1fr) 48px 34px;
  }

  .track-row.track-row--online {
    grid-template-columns: 36px 44px minmax(0, 1fr) 48px 76px;
  }

  .track-row__duration {
    grid-column: 4;
  }

  .track-row__actions {
    grid-column: 5;
  }

  .track-row__meta-album {
    display: inline;
  }
}

@media (max-width: 840px) {
  .track-row {
    grid-template-columns: 32px 44px minmax(0, 1fr) 44px 32px;
    gap: 10px;
    padding-right: 8px;
    padding-left: 8px;
  }

  .track-row.track-row--online {
    grid-template-columns: 32px 44px minmax(0, 1fr) 44px 76px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .track-row__equalizer i {
    animation: none;
  }
}
</style>

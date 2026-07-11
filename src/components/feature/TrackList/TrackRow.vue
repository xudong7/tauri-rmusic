<script setup lang="ts">
import { CaretRight, VideoPause } from "@element-plus/icons-vue";
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
  toggleSelect: [item: TrackRowModel];
}>();

function handleRowClick() {
  if (props.selectionMode) emit("toggleSelect", props.item);
}

function handleActivate() {
  if (!props.selectionMode && !props.item.disabled) emit("activate", props.item);
}
</script>

<template>
  <div
    class="track-row"
    :class="{
      'is-current': item.isCurrent && !selectionMode,
      'is-selected': selected,
      'is-disabled': item.disabled,
    }"
    :style="
      rowHeight ? { height: `${rowHeight}px`, minHeight: `${rowHeight}px` } : undefined
    "
    :title="`${item.title} — ${item.artist}`"
    @click="handleRowClick"
    @dblclick="handleActivate"
  >
    <div class="track-row__play">
      <el-checkbox
        v-if="selectionMode"
        :model-value="selected"
        :aria-label="item.title"
        @click.stop
        @change="emit('toggleSelect', item)"
      />
      <el-button
        v-else
        circle
        size="small"
        :type="item.isCurrent ? 'primary' : 'default'"
        :icon="item.isCurrent && item.isPlaying ? VideoPause : CaretRight"
        :disabled="item.disabled"
        :aria-label="item.title"
        @click.stop="handleActivate"
      />
    </div>

    <div class="track-row__cover">
      <CoverImage :src="item.coverUrl" alt="" :size="44" :radius="6" />
    </div>

    <div class="track-row__main">
      <div class="track-row__title" :class="{ 'is-playing': item.isCurrent }">
        {{ item.title }}
      </div>
      <div class="track-row__meta">
        {{ item.artist }}<template v-if="item.album"> · {{ item.album }}</template>
      </div>
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
  margin-bottom: 2px;
  padding: var(--app-track-row-padding-y) var(--app-track-row-padding-x);
  display: flex;
  align-items: center;
  gap: var(--app-track-row-gap);
  box-sizing: border-box;
  border-radius: var(--app-radius-md);
  cursor: pointer;
  transition:
    background var(--app-control-transition),
    color var(--app-control-transition);
}

.track-row:hover {
  background: var(--hover-bg-color);
}

.track-row.is-current,
.track-row.is-selected {
  background: var(--active-item-bg);
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
.track-row__duration,
.track-row__actions {
  flex-shrink: 0;
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
  min-width: 40px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.track-row__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--app-control-transition);
}

.track-row:hover .track-row__actions,
.track-row:focus-within .track-row__actions {
  opacity: 1;
  pointer-events: auto;
}

:deep(.track-row__play .el-button),
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

:deep(.track-row__play .el-button:not(.el-button--primary):hover),
:deep(.track-row__actions .el-button:hover) {
  color: var(--app-icon-button-hover-color);
  border-color: var(--app-button-border);
  background: var(--app-icon-button-hover-bg);
}

:deep(.track-row__play .el-button.el-button--primary) {
  color: var(--app-play-button-color);
  border-color: transparent;
  background: var(--app-play-button-bg);
  box-shadow: var(--app-play-button-shadow);
}

:deep(.track-row__play .el-button.el-button--primary:hover) {
  transform: translateY(-1px) scale(1.02);
  box-shadow: var(--app-play-button-hover-shadow);
}

@media (hover: none) {
  .track-row__actions {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (max-width: 960px) {
  .track-row {
    gap: 10px;
    padding-right: 8px;
    padding-left: 8px;
  }
}
</style>

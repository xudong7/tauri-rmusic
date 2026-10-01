<script setup lang="ts">
import { computed } from "vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import type { EntityCardModel } from "./types";

const props = defineProps<{
  item: EntityCardModel;
}>();

const emit = defineEmits<{
  activate: [item: EntityCardModel];
}>();

// 歌手用圆形头像，歌单/专辑用圆角封面——与 OnlineMusicList 的歌手条一致。
const coverRadius = computed(() => (props.item.kind === "artist" ? 999 : 10));

function handleClick() {
  if (props.item.disabled) return;
  emit("activate", props.item);
}
</script>

<template>
  <button
    type="button"
    class="entity-card"
    :class="{ 'is-disabled': item.disabled }"
    :disabled="item.disabled"
    :title="item.title"
    @click="handleClick"
  >
    <div class="entity-card__cover">
      <CoverImage
        :src="item.coverUrl"
        alt=""
        :radius="coverRadius"
        :variant="item.kind"
        fluid
      />
      <span v-if="item.badge" class="entity-card__badge">{{ item.badge }}</span>
    </div>
    <div class="entity-card__body">
      <span class="entity-card__title">{{ item.title }}</span>
      <span v-if="item.subtitle" class="entity-card__subtitle">{{ item.subtitle }}</span>
      <span v-if="item.metaLabel" class="entity-card__meta">{{ item.metaLabel }}</span>
    </div>
  </button>
</template>

<style scoped>
.entity-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  min-width: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  /* 网格最多 200 张卡片：视口外的卡片跳过渲染与绘制，
     滚动进入视口时再逐张布局（用 contain-intrinsic-size 预留尺寸防跳动） */
  content-visibility: auto;
  contain-intrinsic-size: auto 180px;
}

.entity-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.entity-card__cover {
  position: relative;
  width: 100%;
  transition:
    transform var(--app-control-transition),
    filter var(--app-control-transition);
}

/* 悬停/聚焦时整块封面轻轻浮起：卡片此前唯一的反馈是标题变色，
   在一屏几十张的网格里太弱。投影用 drop-shadow 以跟随圆形歌手头像。 */
.entity-card:not(.is-disabled):hover .entity-card__cover,
.entity-card:not(.is-disabled):focus-visible .entity-card__cover {
  transform: translateY(-2px);
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.22));
}

.entity-card__badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.56);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  backdrop-filter: blur(4px);
}

.entity-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.entity-card__title {
  font-size: 13px;
  font-weight: 550;
  color: var(--el-text-color-primary);
  /* 两行截断：歌单标题普遍偏长，单行截断丢信息太多 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.entity-card__subtitle,
.entity-card__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-card:hover .entity-card__title {
  color: var(--el-color-primary);
}

.entity-card:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>

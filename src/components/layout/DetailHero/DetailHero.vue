<script setup lang="ts">
/**
 * 详情页的头部：左边封面，中间「类型 / 标题 / 元信息」，右端放次要操作。
 *
 * 与 PageHeader 是两种东西，不要合并：PageHeader 是列表页的紧凑单行头
 * （标题与副标题同一行，为的是让列表尽量早出现），而详情页要交代
 * 「这是什么、有多少、谁做的」。
 *
 * 这里刻意没有「播放全部 / 随机播放」：点列表里任意一首歌，整份列表就已经
 * 成为播放队列（见各页的 playOnlineSong(song, { queue })），两个按钮只是
 * 替用户点了第一首——而它们占掉的那一行，本身就是这一页最缺的空间。
 *
 * 只负责展示：额外操作由调用方从 actions 插槽塞进来。
 */
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";

withDefaults(
  defineProps<{
    coverUrl: string;
    /** 封面形状。歌手用圆形，其余用圆角方图。 */
    variant?: "album" | "playlist" | "artist";
    /** 标题上方的小字，交代这是什么（专辑 / 歌单 / 歌手） */
    eyebrow?: string;
    title: string;
    /** 标题下方已拼好的元信息（歌手 · 24 首 · 2015/04/26 · Aniplex） */
    meta?: string;
    /** 传入时右端显示返回键 */
    backLabel?: string;
  }>(),
  {
    variant: "album",
    eyebrow: "",
    meta: "",
    backLabel: "",
  }
);

const emit = defineEmits<{
  back: [];
}>();
</script>

<template>
  <header class="detail-hero">
    <div class="detail-hero__body">
      <CoverImage
        :src="coverUrl"
        alt=""
        :size="124"
        :radius="variant === 'artist' ? 999 : 12"
        :variant="variant"
        class="detail-hero__cover"
      />

      <div class="detail-hero__text">
        <p v-if="eyebrow" class="detail-hero__eyebrow">{{ eyebrow }}</p>
        <h1 class="detail-hero__title">{{ title }}</h1>
        <p v-if="meta" class="detail-hero__meta">{{ meta }}</p>
      </div>

      <!-- 右端一列：返回键与调用方塞进来的次要操作共用这块本来空着的横向
           空间，不额外占行。 -->
      <div class="detail-hero__side">
        <button
          v-if="backLabel"
          type="button"
          class="detail-hero__back"
          @click="emit('back')"
        >
          <span class="detail-hero__back-arrow" aria-hidden="true">‹</span>
          {{ backLabel }}
        </button>
        <div v-if="$slots.actions" class="detail-hero__actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.detail-hero {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.detail-hero__body {
  display: flex;
  align-items: center;
  gap: 20px;
}

.detail-hero__cover {
  flex-shrink: 0;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.14);
}

.detail-hero__text {
  /* 吃掉中间的全部余量：标题因此拿到最宽的一栏 */
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-hero__eyebrow {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* 允许两行：专辑名普遍很长，单行截断会丢掉真正区分它们的那半句。
   两行之上才截断——那时它已经长到不像标题了。 */
.detail-hero__title {
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--el-text-color-primary);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.02em;
}

.detail-hero__meta {
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-hero__side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

.detail-hero__back {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  border: none;
  border-radius: var(--app-radius-sm);
  color: var(--el-text-color-secondary);
  background: transparent;
  font-size: 12.5px;
  cursor: pointer;
  transition: color var(--app-control-transition);
}

.detail-hero__back:hover {
  color: var(--el-color-primary);
}

.detail-hero__back-arrow {
  font-size: 16px;
  line-height: 1;
}

.detail-hero__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

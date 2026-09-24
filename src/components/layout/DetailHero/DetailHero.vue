<script setup lang="ts">
/**
 * 详情页的大头部：左边大封面，右边「类型 / 标题 / 元信息 / 主操作」。
 *
 * 与 PageHeader 是两种东西，不要合并：PageHeader 是列表页的紧凑单行头
 * （标题与副标题同一行，为的是让列表尽量早出现），而详情页需要一个能交代
 * 「这是什么、有多少、谁做的」并给出主操作的大头部。之前详情页也用
 * PageHeader：专辑名一长就和右侧元信息挤在一起，而且整页没有任何针对
 * 整个列表的操作——只能点某一首歌才开始播放。
 *
 * 只负责展示：播什么、怎么播由调用方决定。
 */
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import ShuffleIcon from "@/components/base/icons/ShuffleIcon.vue";

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
    playLabel: string;
    shuffleLabel: string;
    /** 传入时左上角显示返回键 */
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
  play: [];
  shuffle: [];
  back: [];
}>();
</script>

<template>
  <header class="detail-hero">
    <button
      v-if="backLabel"
      type="button"
      class="detail-hero__back"
      @click="emit('back')"
    >
      <span class="detail-hero__back-arrow" aria-hidden="true">‹</span>
      {{ backLabel }}
    </button>

    <div class="detail-hero__body">
      <CoverImage
        :src="coverUrl"
        alt=""
        :size="168"
        :radius="variant === 'artist' ? 999 : 14"
        :variant="variant"
        class="detail-hero__cover"
      />
      <div class="detail-hero__text">
        <p v-if="eyebrow" class="detail-hero__eyebrow">{{ eyebrow }}</p>
        <h1 class="detail-hero__title">{{ title }}</h1>
        <p v-if="meta" class="detail-hero__meta">{{ meta }}</p>
        <div class="detail-hero__actions">
          <el-button
            type="primary"
            class="detail-hero__play"
            :icon="PlayIcon"
            @click="emit('play')"
          >
            {{ playLabel }}
          </el-button>
          <el-button
            class="detail-hero__shuffle"
            :icon="ShuffleIcon"
            @click="emit('shuffle')"
          >
            {{ shuffleLabel }}
          </el-button>
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.detail-hero {
  flex-shrink: 0;
  margin-bottom: 20px;
}

/* 返回键独立成行、贴左：放进下面那排操作里会和「播放全部」抢注意力，
   而它是次要动作。 */
.detail-hero__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: var(--app-radius-sm);
  color: var(--el-text-color-secondary);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: color var(--app-control-transition);
}

.detail-hero__back:hover {
  color: var(--el-color-primary);
}

.detail-hero__back-arrow {
  font-size: 17px;
  line-height: 1;
}

.detail-hero__body {
  display: flex;
  align-items: flex-end;
  gap: 24px;
}

.detail-hero__cover {
  flex-shrink: 0;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}

.detail-hero__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 2px;
}

.detail-hero__eyebrow {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.022em;
}

.detail-hero__meta {
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-hero__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

/* 主操作是胶囊实心，次操作是描边——两者宽度不必相等，靠形状区分层级 */
.detail-hero__play,
.detail-hero__shuffle {
  height: var(--app-button-height);
  padding: 0 16px;
  border-radius: var(--app-radius-full);
  font-weight: 600;
}
</style>

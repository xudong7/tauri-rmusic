<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Collection, Headset, List, User } from "@element-plus/icons-vue";

type CoverVariant = "track" | "artist" | "album" | "playlist";

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    clickable?: boolean;
    size?: number;
    radius?: number;
    fallback?: string;
    lazy?: boolean;
    fit?: "cover" | "contain";
    variant?: CoverVariant;
    /** 宽度撑满父容器并保持 1:1，用于卡片网格。开启时忽略 size。 */
    fluid?: boolean;
  }>(),
  {
    alt: "",
    clickable: false,
    size: 56,
    radius: 10,
    fallback: "",
    lazy: true,
    fit: "cover",
    variant: "track",
    fluid: false,
  }
);

const hasError = ref(false);
/** 图片尚未 onload：此时压一层微光，避免大图或网络封面出现空白块 */
const isLoaded = ref(false);

const boxStyle = computed(() => {
  if (props.fluid) {
    return {
      width: "100%",
      height: "auto",
      aspectRatio: "1 / 1",
      borderRadius: `${props.radius}px`,
    };
  }
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${props.radius}px`,
  };
});

const imageStyle = computed(() => ({
  objectFit: props.fit,
}));

const imageSrc = computed(() => {
  if (!props.src || hasError.value) return props.fallback;
  return props.src;
});

const shouldShowImage = computed(() => Boolean(imageSrc.value));

const placeholderIcon = computed(() => {
  if (props.variant === "artist") return User;
  if (props.variant === "album") return Collection;
  if (props.variant === "playlist") return List;
  return Headset;
});

watch(
  () => props.src,
  () => {
    hasError.value = false;
    isLoaded.value = false;
  }
);
</script>

<template>
  <div class="cover-image" :class="{ clickable }" :style="boxStyle">
    <img
      v-if="shouldShowImage"
      class="img"
      :class="{ 'is-loaded': isLoaded }"
      :src="imageSrc"
      :alt="alt"
      :loading="lazy ? 'lazy' : 'eager'"
      :style="imageStyle"
      decoding="async"
      @load="isLoaded = true"
      @error="hasError = true"
    />
    <span v-if="shouldShowImage && !isLoaded" class="shimmer" aria-hidden="true" />
    <div v-else-if="!shouldShowImage" class="placeholder" :style="boxStyle">
      <el-icon class="icon"><component :is="placeholderIcon" /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.cover-image {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent), var(--el-fill-color);
  border: 1px solid var(--el-border-color-light);
}

.cover-image.clickable {
  cursor: pointer;
}

.img {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0;
  transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.img.is-loaded {
  opacity: 1;
}

/* 图片解码完成前的微光扫过：底色之上盖一道随主题变亮的窄带。
   浅色主题下是近白的浅灰，深色主题下提亮一档，不改变占位图的语气。 */
.shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 28%,
    color-mix(in srgb, var(--el-fill-color-light) 70%, var(--el-text-color-secondary)) 50%,
    transparent 72%
  );
  background-size: 220% 100%;
  animation: cover-shimmer 1.2s linear infinite;
}

@keyframes cover-shimmer {
  from {
    background-position: 150% 0;
  }

  to {
    background-position: -70% 0;
  }
}

/* 静态环境里扫光会停在半途变成一块灰斑，直接不显示，占位底色已够 */
@media (prefers-reduced-motion: reduce) {
  .shimmer {
    display: none;
  }
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.icon {
  width: 42%;
  height: 42%;
  opacity: 0.64;
}
</style>

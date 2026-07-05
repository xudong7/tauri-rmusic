<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Collection, Headset, User } from "@element-plus/icons-vue";

type CoverVariant = "track" | "artist" | "album";

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
  }>(),
  {
    alt: "cover",
    clickable: false,
    size: 56,
    radius: 10,
    fallback: "",
    lazy: true,
    fit: "cover",
    variant: "track",
  }
);

const hasError = ref(false);

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.radius}px`,
}));

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
  return Headset;
});

watch(
  () => props.src,
  () => {
    hasError.value = false;
  }
);
</script>

<template>
  <div class="cover-image" :class="{ clickable }" :style="boxStyle">
    <img
      v-if="shouldShowImage"
      class="img"
      :src="imageSrc"
      :alt="alt"
      :loading="lazy ? 'lazy' : 'eager'"
      :style="imageStyle"
      decoding="async"
      @error="hasError = true"
    />
    <div v-else class="placeholder" :style="boxStyle">
      <el-icon class="icon"><component :is="placeholderIcon" /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.cover-image {
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

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Headset } from "@element-plus/icons-vue";
import { DEFAULT_COVER_URL } from "@/constants";

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
  }>(),
  {
    alt: "cover",
    clickable: false,
    size: 56,
    radius: 10,
    fallback: DEFAULT_COVER_URL,
    lazy: true,
    fit: "cover",
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
      <el-icon class="icon"><Headset /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.cover-image {
  overflow: hidden;
  flex-shrink: 0;
  background: var(--el-fill-color);
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
}

.icon {
  width: 70%;
  height: 70%;
}
</style>

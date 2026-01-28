<script setup lang="ts">
import { computed } from "vue";
import { Headset } from "@element-plus/icons-vue";

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    clickable?: boolean;
    size?: number;
    radius?: number;
  }>(),
  { alt: "cover", clickable: false, size: 56, radius: 10 }
);

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.radius}px`,
}));
</script>

<template>
  <div class="cover-image" :class="{ clickable }" :style="boxStyle">
    <img v-if="src" class="img" :src="src" :alt="alt" />
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
  object-fit: cover;
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

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

/**
 * 超长文本的悬停跑马灯。
 *
 * 容器不换行、内容溢出时：静止显示右侧渐隐（表示被截断），悬停后按溢出
 * 距离缓慢往返滚动。不溢出的文本完全不受影响；reduced-motion 下只保留渐隐。
 *
 * 测量在挂载、文本变化与窗口尺寸变化时进行——文本宽度取决于字体渲染，
 * 只能在真实 DOM 里量，不能靠估算。
 */
const props = withDefaults(
  defineProps<{
    text: string;
    /** 每像素对应的滚动时长基准（越大越慢） */
    speed?: number;
  }>(),
  { speed: 40 }
);

const rootRef = ref<HTMLElement | null>(null);
const innerRef = ref<HTMLElement | null>(null);
const overflowPx = ref(0);
const isHovering = ref(false);

function measure() {
  const root = rootRef.value;
  const inner = innerRef.value;
  if (!root || !inner) return;
  overflowPx.value = Math.max(0, inner.scrollWidth - root.clientWidth);
}

onMounted(() => {
  measure();
  window.addEventListener("resize", measure);
});

onUnmounted(() => {
  window.removeEventListener("resize", measure);
});

watch(
  () => props.text,
  () => void nextTick(measure)
);

const isOverflowing = computed(() => overflowPx.value > 0);
const isAnimating = computed(() => isHovering.value && isOverflowing.value);
const marqueeStyle = computed(() => {
  if (!isAnimating.value) return undefined;
  return {
    "--marquee-shift": `-${overflowPx.value}px`,
    "--marquee-duration": `${Math.max(4, Math.round(overflowPx.value / props.speed) + 2)}s`,
  };
});

defineExpose({ measure });
</script>

<template>
  <span
    ref="rootRef"
    class="marquee"
    :class="{ 'is-overflowing': isOverflowing, 'is-scrolling': isAnimating }"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <span
      ref="innerRef"
      class="marquee__inner"
      :class="{ 'is-animating': isAnimating }"
      :style="marqueeStyle"
      ><slot>{{ text }}</slot></span
    >
  </span>
</template>

<style scoped>
.marquee {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

/* 溢出且未滚动时右侧渐隐，提示还有内容 */
.marquee.is-overflowing {
  mask-image: linear-gradient(90deg, #000 calc(100% - 20px), transparent);
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 20px), transparent);
}

.marquee.is-scrolling {
  mask-image: none;
  -webkit-mask-image: none;
}

.marquee__inner {
  display: inline-block;
  will-change: transform;
}

.marquee__inner.is-animating {
  animation: marquee-scroll var(--marquee-duration, 8s) linear alternate infinite;
}

@keyframes marquee-scroll {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(var(--marquee-shift, 0));
  }
}

@media (prefers-reduced-motion: reduce) {
  .marquee__inner.is-animating {
    animation: none;
  }
}
</style>

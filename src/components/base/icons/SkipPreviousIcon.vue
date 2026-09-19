<script setup lang="ts">
/**
 * 上一首：实心左三角 + 左侧竖条（参考图里的切歌图示）。
 * 与 PlayIcon 同一套画法：粗描边把三角吹胖、linejoin 取 round 圆角，
 * 竖条用圆角矩形，实心块比早期版本厚实。
 */
</script>

<template>
  <svg class="skip-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M18.8 6.2 8.8 12 18.8 17.8Z"
      stroke="currentColor"
      stroke-width="4.4"
      stroke-linejoin="round"
    />
    <rect x="3" y="4" width="2.8" height="16" rx="1.4" />
  </svg>
</template>

<style scoped>
.skip-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

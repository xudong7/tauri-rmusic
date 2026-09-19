<script setup lang="ts">
/**
 * 无框的暂停图标：两条竖杠。
 *
 * 与 PlayIcon 成对，所以高度、视觉重量都按同一套数值来（高 16、总宽 8.4，
 * 都在 24 视窗里居中）。竖杠比早期版本更粗，实心块在小尺寸下也够厚实。
 * Element Plus 没有不带圈的暂停图标，只能自绘。
 */
</script>

<template>
  <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.8 4h4.4v16H6.8zM12.8 4h4.4v16h-4.4z" />
  </svg>
</template>

<style scoped>
.pause-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

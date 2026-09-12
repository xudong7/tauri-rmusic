<script setup lang="ts">
/**
 * 无框的暂停图标：两条竖杠。
 *
 * 与 PlayIcon 成对，所以高度、视觉重量都按同一套数值来（高 15、总宽 8，
 * 都在 24 视窗里居中）。Element Plus 没有不带圈的暂停图标，只能自绘。
 */
</script>

<template>
  <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 4.5h2.8v15H8zM13.2 4.5H16v15h-2.8z" />
  </svg>
</template>

<style scoped>
.pause-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

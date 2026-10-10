<script setup lang="ts">
/**
 * 还原窗口：一个圆角方框。
 *
 * Element Plus 的 ScaleToOriginal 带四角标记，在迷你条的小尺寸下像一团噪点；
 * 参考图里的复原键就是一个干净的空心方框。
 */
</script>

<template>
  <svg
    class="restore-window-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="3.4" />
  </svg>
</template>

<style scoped>
.restore-window-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

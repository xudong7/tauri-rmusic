<script setup lang="ts">
/**
 * 上一首：实心左三角 + 左侧竖条（参考图里的切歌图示）。
 * Element Plus 的 ArrowLeft 是细箭头，表达的是「返回」而不是「切歌」，
 * 所以自绘一个与播放/暂停同一套实心语言的无框图标。
 */
</script>

<template>
  <svg class="skip-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2.4v12H6z" />
    <path d="M9.9 12 18.6 6v12z" />
  </svg>
</template>

<style scoped>
.skip-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

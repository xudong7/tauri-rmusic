<script setup lang="ts">
/**
 * 顺序播放：列表循环的环形箭头。
 * 顺序模式实际是绕列表循环（见 playbackQueue 的 getSequentialIndex），
 * 所以用「循环」而不是早期 Element Plus Sort 的排序箭头；粗描边 + 圆角，
 * 与实心的播放/暂停同一套厚度。
 */
</script>

<template>
  <svg
    class="repeat-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M17.6 6.4H7.2A3.2 3.2 0 0 0 4 9.6v4.8a3.2 3.2 0 0 0 3.2 3.2h9.6a3.2 3.2 0 0 0 3.2-3.2V9.6"
    />
    <path d="M14.8 3.6 17.6 6.4 14.8 9.2" />
  </svg>
</template>

<style scoped>
.repeat-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

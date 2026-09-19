<script setup lang="ts">
/**
 * 单曲循环：环形箭头 + 中间的「1」，与 RepeatIcon 同一套线条。
 */
</script>

<template>
  <svg
    class="repeat-one-icon"
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
    <path d="M11.4 10.6 13.6 9.2v5.6" />
  </svg>
</template>

<style scoped>
.repeat-one-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

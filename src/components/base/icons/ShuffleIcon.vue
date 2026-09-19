<script setup lang="ts">
/**
 * 随机播放：两条交叉的箭头（shuffle）。
 * 早期用的 Element Plus Refresh 是刷新箭头，和单曲循环的图标几乎一样；
 * 换成通用的 shuffle 之后三个播放模式互相区分得开。
 */
</script>

<template>
  <svg
    class="shuffle-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3.4 6.8h2.4c1.4 0 2.7.7 3.5 1.9l4.6 6.6c.8 1.2 2.1 1.9 3.5 1.9h2.4" />
    <path d="M3.4 17.2h2.4c1.4 0 2.7-.7 3.5-1.9l4.6-6.6c.8-1.2 2.1-1.9 3.5-1.9h2.4" />
    <path d="M17.6 14.4 20.2 17.2 17.6 20" />
    <path d="M17.6 4 20.2 6.8 17.6 9.6" />
  </svg>
</template>

<style scoped>
.shuffle-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

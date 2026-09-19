<script setup lang="ts">
/**
 * 上一首：实心左三角 + 左侧竖条（参考图里的切歌图示）。
 * 圆角画进路径，不用填充 + 粗描边叠加（半透明色下会叠出一圈深色描线），
 * 与 PlayIcon 同一套轮廓，只是镜像后放在左侧。
 */
</script>

<template>
  <svg class="skip-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M21 6.2 21 17.8A2.2 2.2 0 0 1 17.7 19.7L7.7 13.9A2.2 2.2 0 0 1 7.7 10.1L17.7 4.3A2.2 2.2 0 0 1 21 6.2Z"
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

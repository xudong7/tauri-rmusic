<script setup lang="ts">
/**
 * 迷你播放器：一个大圆角矩形描边 + 右下角一个实心小矩形。
 * Element Plus 里没有对应图标（ScaleToOriginal 是最大化/还原用的），自己画。
 */
</script>

<template>
  <svg class="mini-player-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect
      x="3"
      y="4.6"
      width="18"
      height="14.8"
      rx="2.6"
      stroke="currentColor"
      stroke-width="2"
    />
    <rect x="11.6" y="12.4" width="7.6" height="5.2" rx="1.4" fill="currentColor" />
  </svg>
</template>

<style scoped>
.mini-player-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

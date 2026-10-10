<script setup lang="ts">
/**
 * 迷你播放器（主窗顶栏的启动按钮）。
 *
 * 描边式画中画：大圆角矩形 + 右下角小圆角矩形，大框在小框处断开，
 * 避免两条描边交叉成一团。两个框都是描边、不填充。
 */
</script>

<template>
  <svg
    class="mini-player-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M12.2 19H6.4A3.4 3.4 0 0 1 3 15.6V7.4A3.4 3.4 0 0 1 6.4 4h11.2A3.4 3.4 0 0 1 21 7.4v5.8"
    />
    <rect x="12.8" y="13.6" width="8.2" height="6.8" rx="2.2" />
  </svg>
</template>

<style scoped>
.mini-player-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

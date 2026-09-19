<script setup lang="ts">
/**
 * 音量：实心喇叭 + 两道圆头声波。
 * 原先在播放栏和沉浸页各写了一份内联 SVG，抽出来共用；喇叭的圆角画进
 * 路径（半透明色下填充 + 描边叠加会叠出一圈深色描线），声波只描边不填充。
 */
</script>

<template>
  <svg class="volume-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M3.1 9.4A0.9 0.9 0 0 1 4 8.5L7.2 8.5A0.9 0.9 0 0 1 6.6 8.7L11.4 4.7A0.9 0.9 0 0 1 12.9 5.4L12.9 18.6A0.9 0.9 0 0 1 11.4 19.3L6.6 15.3A0.9 0.9 0 0 1 7.2 15.5L4 15.5A0.9 0.9 0 0 1 3.1 14.6Z"
    />
    <path
      d="M15.4 9.2a4.2 4.2 0 0 1 0 5.6"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <path
      d="M18 6.6a8 8 0 0 1 0 10.8"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.volume-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

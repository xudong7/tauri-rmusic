<script setup lang="ts">
/**
 * 音量：实心喇叭 + 两道圆头声波。
 * 原先在播放栏和沉浸页各写了一份内联 SVG，抽出来共用；喇叭描边取 round
 * 让棱角变圆，声波加粗，与播放/暂停的实心圆角块同一套语言。
 */
</script>

<template>
  <svg class="volume-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M4 9.4h3.2L12 5.4v13.2L7.2 14.6H4z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
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

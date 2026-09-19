<script setup lang="ts">
/**
 * 播放队列：上面两条通栏横线，第三条短一截，右下角补一个播放三角。
 * 照参考图临摹，Element Plus 里没有对应图标，所以自己画；线条加粗、
 * 三角带圆角，与播放/暂停的实心圆角块同一套语言。
 */
</script>

<template>
  <svg class="queue-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3.4 5h17.2M3.4 11.4h17.2M3.4 17.8h8.4"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
    <path
      d="M15.6 14.4 21.4 18 15.6 21.6Z"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.queue-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

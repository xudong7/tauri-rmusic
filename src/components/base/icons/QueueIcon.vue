<script setup lang="ts">
/**
 * 播放队列：上面两条通栏横线，第三条短一截，右下角补一个播放三角。
 * 照参考图临摹，Element Plus 里没有对应图标，所以自己画；线条加粗，
 * 三角的圆角画进路径（半透明色下填充 + 描边叠加会叠出一圈深色描线）。
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
      d="M14.8 14.4 14.8 21.6A0.8 0.8 0 0 0 16 22.3L21.8 18.7A0.8 0.8 0 0 0 21.8 17.3L16 13.7A0.8 0.8 0 0 0 14.8 14.4Z"
      fill="currentColor"
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

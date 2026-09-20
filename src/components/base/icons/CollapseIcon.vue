<script setup lang="ts">
/**
 * 缩小图标：右上、左下两个圆角「L」，顶点朝向中心（与「展开」相反）。
 * 沉浸页底部播放栏用它表示「封面正显示在画面中央，点这里缩回播放栏」；
 * 与播放栏封面的悬停取景框是同一套视觉语言，只是方向相反。
 */
</script>

<template>
  <svg
    class="collapse-icon"
    viewBox="2.4 2.4 19.2 19.2"
    fill="none"
    stroke="currentColor"
    stroke-width="2.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M14.6 4.2V9.8H20.2" fill="none" />
    <path d="M9.4 19.8V14.2H3.8" fill="none" />
  </svg>
</template>

<style scoped>
.collapse-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

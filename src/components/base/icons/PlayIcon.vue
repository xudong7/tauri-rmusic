<script setup lang="ts">
/**
 * 无框的播放三角。
 *
 * Element Plus 的 VideoPlay 把三角套在一个圆圈里。而播放键本身往往就是个
 * 圆按钮，再套一圈就成了「圆中圆」；列表里叠在封面上的情形更明显，那圈线
 * 看着像个多余的边框。所以自绘一个不带圈的版本。
 *
 * 三角按重心居中（顶点 x 与底边 x 满足 (2·底 + 顶)/3 = 中心），与 EP 的
 * CaretRight 同一套比例；底边比早期版本更宽，实心块在小尺寸下也够厚实。
 */
</script>

<template>
  <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8.4 4 19.2 12 8.4 20Z" />
  </svg>
</template>

<style scoped>
.play-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

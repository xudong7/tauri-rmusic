<script setup lang="ts">
/**
 * 无框的播放三角。
 *
 * Element Plus 的 VideoPlay 把三角套在一个圆圈里。而播放键本身往往就是个
 * 圆按钮，再套一圈就成了「圆中圆」；列表里叠在封面上的情形更明显，那圈线
 * 看着像个多余的边框。所以自绘一个不带圈的版本。
 *
 * 实心块要够厚实，所以用粗描边把三角「吹胖」一圈，linejoin 取 round 让三个
 * 角带上圆角（参考图的实心图标就是圆角块）。三角按重心居中：描边后重心仍在
 * 视窗中心，与暂停的竖条块重量相当。
 */
</script>

<template>
  <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M9.2 6.2 19.2 12 9.2 17.8Z"
      stroke="currentColor"
      stroke-width="4.4"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.play-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

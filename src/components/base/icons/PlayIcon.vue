<script setup lang="ts">
/**
 * 无框的播放三角。
 *
 * Element Plus 的 VideoPlay 把三角套在一个圆圈里。而播放键本身往往就是个
 * 圆按钮，再套一圈就成了「圆中圆」；列表里叠在封面上的情形更明显，那圈线
 * 看着像个多余的边框。所以自绘一个不带圈的版本。
 *
 * 圆角直接画进路径里，不用「实心 + 粗描边」的写法：图标颜色是半透明的
 * （沉浸页的控件色带 alpha），描边和填充叠在一起会把 alpha 叠深，看起来
 * 像三角内部多了一圈描线。路径就是早期粗描边版本的轮廓（外扩 2.2、圆角
 * 半径 2.2），尺寸与视觉重量都不变。
 */
</script>

<template>
  <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M7 6.2 7 17.8A2.2 2.2 0 0 0 10.3 19.7L20.3 13.9A2.2 2.2 0 0 0 20.3 10.1L10.3 4.3A2.2 2.2 0 0 0 7 6.2Z"
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

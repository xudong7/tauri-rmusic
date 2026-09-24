<script setup lang="ts">
/**
 * 已在曲库：勾下面加一道基线，读作「已经落到库里了」。
 *
 * 与 CheckIcon 只差一条基线是刻意的——两者要能一眼分开，一个表示刚下完、
 * 一个表示本来就在。之所以不用「实心圆盘挖空勾」那种更像徽章的形状：
 * 行内按钮的图标实际只有 12px 上下，挖空出来的勾只剩 1px 左右，会糊成
 * 一团。这个尺寸下只有粗笔画的正空间形状还看得清，所以不画外框，
 * 靠基线区分。
 */
</script>

<template>
  <svg
    class="in-library-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.4 10.9 9.1 15.6 18.9 5.1" stroke-width="2.4" />
    <path d="M4.4 20.4h14.5" stroke-width="2.4" />
  </svg>
</template>

<style scoped>
.in-library-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

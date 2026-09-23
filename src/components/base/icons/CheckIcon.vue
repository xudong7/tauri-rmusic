<script setup lang="ts">
/**
 * 打勾：表示「刚刚下载完成」。
 *
 * 自绘而不是用 Element Plus 的 CircleCheck——那是勾外套一个圆，而行上的
 * 操作图标只需要表达「成了」这一件事，多一圈线是噪音。
 * 用描边而非填充：颜色交给 currentColor，尺寸跟着字号走，放到哪个按钮里
 * 都不用改。
 */
</script>

<template>
  <svg
    class="check-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.8 12.6 9.6 17.4 19.4 6.8" stroke-width="2.5" />
  </svg>
</template>

<style scoped>
.check-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

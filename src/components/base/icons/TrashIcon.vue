<script setup lang="ts">
/**
 * 垃圾桶图标（描边，非实心）。
 *
 * Element Plus 的 Delete 是实心色块，参考图里这个是空心描边的，所以自绘。
 * 结构自下而上：桶身（上宽下窄，底角略圆）→ 盖（比桶身宽的通栏横条）
 * → 提手（盖上的扁圆顶）→ 桶内两条短竖线。
 *
 * 比例严格照参考图：整体 18 宽 × 20 高，是竖长的（第一版按 24 视窗铺满宽度
 * 画，结果成了横扁的）。提手也比正圆扁一些——参考图里它 10 宽只有 4 高。
 */
</script>

<template>
  <svg
    class="trash-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 提手：扁圆顶，rx 明显大于 ry -->
    <path d="M7.5 6.5V4.4a4.5 2.6 0 0 1 9 0V6.5" stroke-width="1.9" />
    <!-- 盖：比桶身宽的通栏横条 -->
    <path d="M3 6.5h18" stroke-width="2" />
    <!-- 桶身：上宽下窄，底角略圆 -->
    <path
      d="M4 8 6 20.2a1.5 1.5 0 0 0 1.5 1.3h9a1.5 1.5 0 0 0 1.5-1.3L20 8"
      stroke-width="1.9"
    />
    <!-- 桶内两条短竖线 -->
    <path d="M10 11v5M14 11v5" stroke-width="1.7" />
  </svg>
</template>

<style scoped>
.trash-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

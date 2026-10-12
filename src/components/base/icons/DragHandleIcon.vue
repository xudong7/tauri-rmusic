<script setup lang="ts">
/**
 * 拖拽手柄：两列三点。
 * Element Plus 的 Rank 是四向箭头（读起来像「移动/缩放」），Menu 是三条横线，
 * 都不如经典的点阵一眼能认出「按住这里拖」。
 */
</script>

<template>
  <svg
    class="drag-handle-icon"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
</template>

<style scoped>
.drag-handle-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

<script setup lang="ts">
/**
 * 多选图标：三行「小勾 + 横杠」。
 *
 * 照参考图临摹——Element Plus 的 CircleCheck 是勾外套一个圆，那圈线正是
 * 要去掉的东西，所以自绘一个不带圈的。
 * 比例取自参考图实测：勾宽约为杠宽的一半，且比杠略低（勾的视觉重心在下）。
 * 用描边而非填充，两个不同粗细的笔画才能共用一套坐标。
 */
</script>

<template>
  <svg
    class="multi-select-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 三根横杠，比勾略粗 -->
    <path d="M9.6 6.5h11.4M9.6 12.5h11.4M9.6 18.5h11.4" stroke-width="2.4" />
    <!-- 三个小勾，位置比同行的杠低一点 -->
    <path
      d="M2.5 5.5 4.6 7.9 7.8 4.3M2.5 11.5 4.6 13.9 7.8 10.3M2.5 17.5 4.6 19.9 7.8 16.3"
      stroke-width="1.7"
    />
  </svg>
</template>

<style scoped>
.multi-select-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

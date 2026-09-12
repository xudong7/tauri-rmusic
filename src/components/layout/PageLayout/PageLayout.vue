<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 内容高出视口时由页面自己滚动（设置页那种长表单用它） */
    scroll?: boolean;
  }>(),
  {
    scroll: false,
  }
);
</script>

<template>
  <section class="app-page" :class="{ 'app-page--scroll': scroll }">
    <slot />
  </section>
</template>

<style scoped>
/* 铺满内容区：不设宽度上限，也不居中。页边距就是 .main-content 的内边距
   （左右各 32px），窗口拉宽时变宽的是内容本身，而不是两侧的留白。

   这里原先有三档 max-width（default 1280 / wide 1440）配 margin-inline: auto，
   于是整页成了一块居中的窄带：窗口一变宽，左右两侧的空白一起长大，列表却
   停在原地。三档宽度没有任何一处再用，连同 maxWidth 这个 prop 一起删掉——
   留着一个不再起作用的参数，比没有更误导。 */
.app-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.app-page--scroll {
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
</style>

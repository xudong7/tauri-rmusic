<script setup lang="ts">
withDefaults(
  defineProps<{
    maxWidth?: "default" | "wide" | "full";
    scroll?: boolean;
  }>(),
  {
    maxWidth: "default",
    scroll: false,
  }
);
</script>

<template>
  <section
    class="app-page"
    :class="[`app-page--${maxWidth}`, { 'app-page--scroll': scroll }]"
  >
    <slot />
  </section>
</template>

<style scoped>
.app-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.app-page--default {
  max-width: var(--app-page-max-width);
}

.app-page--wide {
  max-width: var(--app-page-wide-max-width);
}

.app-page--full {
  max-width: none;
}

.app-page--scroll {
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
</style>

<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__main">
      <slot name="before-title" />
      <div class="page-header__title-group">
        <h1 class="page-header__title">{{ title }}</h1>
        <span v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</span>
      </div>
      <slot name="after-title" />
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  min-height: var(--app-page-header-height);
  margin-bottom: var(--app-page-header-gap);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-spacing);
  flex-shrink: 0;
}

.page-header__main,
.page-header__title-group,
.page-header__actions {
  min-width: 0;
  display: flex;
  align-items: center;
}

.page-header__main {
  flex: 1;
  gap: 8px;
}

.page-header__title-group {
  gap: 10px;
  position: relative;
  padding-left: 12px;
}

.page-header__title-group::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: var(--app-page-title-accent-height);
  border-radius: var(--app-radius-full);
  background: var(--el-color-primary);
  transform: translateY(-50%);
}

.page-header__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: var(--app-page-title-size);
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-header__subtitle {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.page-header__actions {
  flex-shrink: 0;
  gap: 8px;
}

@media (max-width: 960px) {
  .page-header {
    gap: 10px;
  }
}
</style>

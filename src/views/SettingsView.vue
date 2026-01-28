<script setup lang="ts">
import SettingsWindow from "@/components/feature/SettingsWindow/SettingsWindow.vue";
</script>

<template>
  <div class="settings-view">
    <SettingsWindow />
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
}
</style>

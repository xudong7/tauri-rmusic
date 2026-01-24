<script setup lang="ts">
import SettingsWindow from "../components/SettingsWindow/SettingsWindow.vue";
</script>

<template>
  <div class="settings-view">
    <SettingsWindow />
  </div>
</template>

<style scoped>
.settings-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
</style>

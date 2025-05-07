<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Close, Minus, FullScreen } from "@element-plus/icons-vue";

const appTitle = ref("RMusic");
const appWindow = getCurrentWindow();

// 窗口控制功能
const minimize = async () => {
  await appWindow.minimize();
};

const toggleMaximize = async () => {
  if (await appWindow.isMaximized()) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
};

const close = async () => {
  await appWindow.close();
};

onMounted(() => {
  appWindow.setMinimizable(true);
  appWindow.setMaximizable(true);
});
</script>

<template>
  <div class="title-bar">
    <div class="title-bar-left">
      <img src="/icon.png" alt="Logo" class="title-bar-logo" />
      <div class="title-bar-title">{{ appTitle }}</div>
    </div>
    <div class="title-bar-controls">
      <div class="title-bar-button" @click="minimize">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="title-bar-button" @click="toggleMaximize">
        <el-icon><FullScreen /></el-icon>
      </div>
      <div class="title-bar-button close" @click="close">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped src="./TitleBar.css" />

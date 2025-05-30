<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Close, Minus } from "@element-plus/icons-vue";
import { Window } from "@tauri-apps/api/window";

// 窗口引用
const appWindow = Window.getCurrent();

// 设置数据
const isDarkMode = ref(false);
const downloadPath = ref("");

// 窗口控制函数
const minimize = async () => {
  await appWindow.minimize();
};

const close = async () => {
  await appWindow.close();
};

onMounted(async () => {
  try {
    console.log("Settings window mounted");
  } catch (error) {
    console.error("Settings window error:", error);
  }
});
</script>

<template>
  <div class="settings-window">
    <!-- 自定义标题栏 -->
    <div class="settings-header">
      <div class="header-left">
        <div class="settings-title">设置</div>
      </div>
      <div class="header-right">
        <div class="window-controls">
          <div
            class="header-button window-button"
            @click="minimize"
            title="最小化"
          >
            <el-icon><Minus /></el-icon>
          </div>
          <div
            class="header-button window-button close"
            @click="close"
            title="关闭"
          >
            <el-icon><Close /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置内容区域 -->
    <div class="settings-content">
      <div class="settings-section">
        <h3>外观设置</h3>
        <div class="setting-item">
          <label>主题模式</label>
          <el-switch
            v-model="isDarkMode"
            active-text="深色"
            inactive-text="浅色"
          />
        </div>
      </div>

      <div class="settings-section">
        <h3>下载设置</h3>
        <div class="setting-item">
          <label>下载位置</label>
          <el-input v-model="downloadPath" placeholder="选择下载位置" />
        </div>
      </div>

      <div class="settings-section">
        <h3>关于</h3>
        <div class="setting-item">
          <p>RMusic v1.0.0</p>
          <p>一个基于 Tauri 和 Vue 的音乐播放器</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./SettingsWindow.css" />

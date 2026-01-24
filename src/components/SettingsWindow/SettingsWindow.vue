<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import {
  FolderOpened,
  Brush,
  CircleCheck,
  Download,
  InfoFilled,
} from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useMusicStore } from "@/stores/musicStore";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";

const musicStore = useMusicStore();
const downloadPath = ref("");
const autoStartEnabled = ref(false);

watch(
  () => musicStore.isDarkMode,
  () => musicStore.applyTheme()
);

window.addEventListener("storage", (e) => {
  if (e.key === "theme" && e.newValue) {
    const shouldBeDark = e.newValue === "dark";
    if (musicStore.isDarkMode !== shouldBeDark)
      musicStore.setThemeWithoutSave(shouldBeDark);
  }
});

// 主题切换处理
const handleThemeChange = (value: boolean) => {
  // 使用新的 setTheme 方法
  musicStore.setTheme(value);
  console.log("Theme changed to:", value ? "dark" : "light");
};

// 选择下载目录
const selectDownloadPath = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择下载位置",
    });

    if (selected && typeof selected === "string") {
      downloadPath.value = selected;
      await musicStore.setDefaultDirectory(selected);
    }
  } catch (error) {
    console.error("选择下载目录失败:", error);
  }
};

// 重置下载目录为默认
const resetDownloadPath = async () => {
  try {
    await musicStore.resetDefaultDirectory();
    // 更新显示的路径
    const currentDefaultDir = musicStore.getDefaultDirectory();
    if (currentDefaultDir) {
      downloadPath.value = currentDefaultDir;
    }
  } catch (error) {
    console.error("重置下载目录失败:", error);
  }
};

// 处理开机自启动状态变化
const handleAutoStartChange = async (value: boolean) => {
  try {
    if (value) {
      await enable();
      console.log("开机自启动已启用");
    } else {
      await disable();
      console.log("开机自启动已禁用");
    }
  } catch (error) {
    console.error("设置开机自启动失败:", error);
    // 如果设置失败，恢复原状态
    autoStartEnabled.value = !value;
  }
};

onMounted(async () => {
  try {
    await musicStore.initialize();
    const dir = musicStore.getDefaultDirectory();
    if (dir) downloadPath.value = dir;
    try {
      autoStartEnabled.value = await isEnabled();
    } catch (e) {
      console.error("获取开机自启动状态失败:", e);
    }
  } catch (e) {
    console.error("Settings window error:", e);
  }
});
</script>

<template>
  <div class="settings-window">
    <div class="settings-content">
      <h2 class="settings-page-title">设置</h2>
      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Brush /></el-icon> 外观设置
        </h3>
        <div class="setting-item">
          <label>主题模式</label>
          <el-switch
            v-model="musicStore.isDarkMode"
            active-text="深色"
            inactive-text="浅色"
            @change="handleThemeChange"
          />
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><CircleCheck /></el-icon> 应用设置
        </h3>
        <div class="setting-item">
          <label>开机自启动</label>
          <el-switch
            v-model="autoStartEnabled"
            active-text="启用"
            inactive-text="禁用"
            @change="handleAutoStartChange"
          />
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Download /></el-icon> 下载设置
        </h3>
        <div class="setting-item">
          <label>下载位置</label>
          <div class="download-path-container">
            <el-input
              v-model="downloadPath"
              placeholder="选择下载位置"
              readonly
              class="download-path-input"
            />
            <el-button @click="selectDownloadPath" :icon="FolderOpened" type="primary">
              浏览
            </el-button>
            <el-button @click="resetDownloadPath" type="default"> 重置 </el-button>
          </div>
        </div>
      </div>

      <div class="settings-section settings-about">
        <h3 class="section-title">
          <el-icon><InfoFilled /></el-icon> 关于
        </h3>
        <div class="setting-item about-content">
          <p class="about-version">RMusic v1.0.0</p>
          <p class="about-desc">一个基于 Tauri 和 Vue 的音乐播放器</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./SettingsWindow.css" />

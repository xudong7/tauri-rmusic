<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import {
  Close,
  Minus,
  ScaleToOriginal,
  FullScreen,
} from "@element-plus/icons-vue";
import { Window } from "@tauri-apps/api/window";
import { useMusicStore } from "@/stores/musicStore";

// 窗口引用
const appWindow = Window.getCurrent();
const isMaximized = ref(false);

// 使用 musicStore
const musicStore = useMusicStore();

// 设置数据
const downloadPath = ref("");

// 监听主题变化
watch(
  () => musicStore.isDarkMode,
  () => {
    // 主题变化时，应用到当前窗口
    musicStore.applyTheme();
  }
);

// 监听 localStorage 变化以同步主题
window.addEventListener("storage", (e) => {
  if (e.key === "theme" && e.newValue) {
    const shouldBeDark = e.newValue === "dark";
    if (musicStore.isDarkMode !== shouldBeDark) {
      // 使用不保存到 localStorage 的方法（避免循环）
      musicStore.setThemeWithoutSave(shouldBeDark);
    }
  }
});

// 计算最大化/恢复的图标
const maximizeIcon = computed(() => {
  return isMaximized.value ? ScaleToOriginal : FullScreen;
});

// 检查窗口当前是否已最大化
async function checkMaximized() {
  isMaximized.value = await appWindow.isMaximized();
}

// 窗口控制函数
const minimize = async () => {
  await appWindow.minimize();
};

const toggleMaximize = async () => {
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
  isMaximized.value = !isMaximized.value;
};

const close = async () => {
  await appWindow.close();
};

// 主题切换处理
const handleThemeChange = (value: boolean) => {
  // 使用新的 setTheme 方法
  musicStore.setTheme(value);
  console.log("Theme changed to:", value ? "dark" : "light");
};

onMounted(async () => {
  try {
    console.log("Settings window mounted");
    // 直接初始化 musicStore 和应用主题
    await musicStore.initialize();

    console.log("Settings window theme state:", musicStore.isDarkMode);
    console.log("LocalStorage theme:", localStorage.getItem("theme"));
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
            class="header-button window-button"
            @click="toggleMaximize"
            :title="isMaximized ? '还原' : '最大化'"
          >
            <el-icon><component :is="maximizeIcon" /></el-icon>
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
            v-model="musicStore.isDarkMode"
            active-text="深色"
            inactive-text="浅色"
            @change="handleThemeChange"
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

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import {
  Close,
  Minus,
  ScaleToOriginal,
  FullScreen,
  FolderOpened,
} from "@element-plus/icons-vue";
import { Window } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useMusicStore } from "@/stores/musicStore";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";

// 窗口引用
const appWindow = Window.getCurrent();
const isMaximized = ref(false);

// 使用 musicStore
const musicStore = useMusicStore();

// 设置数据
const downloadPath = ref("");
const autoStartEnabled = ref(false);

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
    console.log("Settings window mounted");
    // 直接初始化 musicStore 和应用主题
    await musicStore.initialize();

    // 加载当前的默认下载目录
    const currentDefaultDir = musicStore.getDefaultDirectory();
    if (currentDefaultDir) {
      downloadPath.value = currentDefaultDir;
    }

    // 加载开机自启动状态
    try {
      autoStartEnabled.value = await isEnabled();
    } catch (error) {
      console.error("获取开机自启动状态失败:", error);
    }

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
        <h3>应用设置</h3>
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
        <h3>下载设置</h3>
        <div class="setting-item">
          <label>下载位置</label>
          <div class="download-path-container">
            <el-input
              v-model="downloadPath"
              placeholder="选择下载位置"
              readonly
            />
            <el-button
              @click="selectDownloadPath"
              :icon="FolderOpened"
              type="primary"
            >
              浏览
            </el-button>
            <el-button @click="resetDownloadPath" type="default">
              重置
            </el-button>
          </div>
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

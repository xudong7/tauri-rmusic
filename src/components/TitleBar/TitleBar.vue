<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { Window } from "@tauri-apps/api/window";
import { 
  Close, 
  Minus, 
  FullScreen, 
  ScaleToOriginal, 
  MagicStick
} from "@element-plus/icons-vue";

const props = defineProps<{
  isDarkMode: boolean;
}>();

const appTitle = ref("RMusic");
const appWindow = Window.getCurrent();
const isMaximized = ref(false);

// 检查窗口当前是否已最大化
async function checkMaximized() {
  isMaximized.value = await appWindow.isMaximized();
}

// 窗口控制功能
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

// 计算最大化/恢复的图标
const maximizeIcon = computed(() => {
  return isMaximized.value ? ScaleToOriginal : FullScreen;
});

// 版本号
const appVersion = ref("v0.6.0");

onMounted(async () => {
  try {
    await checkMaximized();
    
    // 监听窗口最大化/还原状态变化
    appWindow.onResized(() => {
      checkMaximized();
    });
  } catch (error) {
    console.error("窗口操作错误:", error);
  }
});
</script>

<template>
  <div class="title-bar" :class="{ 'is-maximized': isMaximized, 'is-dark-mode': props.isDarkMode }">
    <div class="title-bar-left">
      <img src="/icon.png" alt="Logo" class="title-bar-logo" />
      <div class="title-bar-title">
        {{ appTitle }}
        <span class="app-version">{{ appVersion }}</span>
      </div>
    </div>
    <div class="title-bar-controls">
      <div class="title-bar-button" @click="minimize" title="最小化">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="title-bar-button" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
        <el-icon><component :is="maximizeIcon" /></el-icon>
      </div>
      <div class="title-bar-button close" @click="close" title="关闭">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped src="./TitleBar.css" />
<style scoped>
.app-version {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 8px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}

.is-maximized {
  border-radius: 0;
}

.is-dark-mode {
  background-color: var(--el-bg-color-dark);
  color: var(--el-text-color-light);
}

/* 响应式布局 */
@media (max-width: 768px) {
  .app-version {
    display: none;
  }
}
</style>

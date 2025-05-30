<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  // Folder,
  Search,
  Switch,
  Moon,
  Sunny,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Setting,
  Close,
} from "@element-plus/icons-vue";
import { ViewMode } from "../../types/model";
import { Window } from "@tauri-apps/api/window";
import { createSettingsWindow } from "../../utils/settingsWindow";

const props = defineProps<{
  currentDirectory: string;
  viewMode: ViewMode;
  isDarkMode: boolean;
}>();

const emit = defineEmits([
  // "select-directory",
  "refresh",
  "search",
  "toggle-theme",
]);

// 路由实例
const router = useRouter();

// 搜索关键字
const searchKeyword = ref("");
// 窗口引用
const appWindow = Window.getCurrent();
// 是否最大化
const isMaximized = ref(false);

// 执行搜索
function handleSearch() {
  // if (!searchKeyword.value.trim()) {
  //   ElMessage.info("请输入搜索关键词");
  //   return;
  // }
  emit("search", searchKeyword.value);
}

const openSettingWindow = async () => {
  try {
    createSettingsWindow();
  } catch (error) {
    console.error("打开设置窗口失败:", error);
  }
};

// 切换视图模式 - 现在通过路由导航
function toggleViewMode() {
  if (props.viewMode === ViewMode.LOCAL) {
    router.push("/online");
  } else {
    router.push("/");
  }
}

// 切换主题模式
function toggleTheme() {
  emit("toggle-theme");
}

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
  await appWindow.hide();
};

// 计算最大化/恢复的图标
const maximizeIcon = computed(() => {
  return isMaximized.value ? ScaleToOriginal : FullScreen;
});

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
  <div
    class="header-bar"
    :class="{ 'is-maximized': isMaximized, 'is-dark-mode': isDarkMode }"
  >
    <div class="header-left">
      <div class="directory-controls">
        <!-- <el-tooltip
          :content="currentDirectory || '未选择文件夹'"
          placement="bottom"
          :disabled="viewMode === ViewMode.ONLINE"
          effect="light"
        >
          <el-button
            @click="emit('select-directory')"
            :icon="Folder"
            type="primary"
            :disabled="viewMode === ViewMode.ONLINE"
            class="header-button"
            size="default"
          >
            选择目录
          </el-button>
        </el-tooltip> -->
        <el-button
          @click="toggleViewMode"
          :icon="Switch"
          :type="viewMode === ViewMode.ONLINE ? 'success' : 'info'"
          class="header-button"
          size="default"
        >
          {{ viewMode === ViewMode.LOCAL ? "本地音乐" : "在线搜索" }}
        </el-button>
      </div>
    </div>

    <div class="header-center">
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          :placeholder="
            viewMode === ViewMode.LOCAL ? '搜索本地歌曲...' : '搜索在线歌曲...'
          "
          class="search-input"
          @keyup.enter="handleSearch"
        >
          <template #append>
            <el-button :icon="Search" @click="handleSearch" />
          </template>
        </el-input>
      </div>
    </div>

    <div class="header-right">
      <div class="window-controls">
        <div
          class="header-button window-button"
          @click="toggleTheme"
          :title="isDarkMode ? '切换到亮色模式' : '切换到暗色模式'"
        >
          <el-icon>
            <component :is="isDarkMode ? Moon : Sunny" />
          </el-icon>
        </div>
        <div
          class="header-button window-button"
          @click="openSettingWindow"
          title="设置"
        >
          <el-icon><Setting /></el-icon>
        </div>
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
</template>

<style scoped src="./HeaderBar.css" />

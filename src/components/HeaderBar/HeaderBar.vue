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
  Upload,
} from "@element-plus/icons-vue";
import { ViewMode } from "../../types/model";
import { Window } from "@tauri-apps/api/window";
import { createSettingsWindow } from "../../utils/settingsWindow";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";

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

async function importMusic() {
  try {
    // 打开文件选择对话框
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "音频文件",
          extensions: ["mp3", "wav", "ogg", "flac"],
        },
      ],
    });

    // 如果用户取消选择，直接返回
    if (!selected || (Array.isArray(selected) && selected.length === 0)) {
      return;
    }

    // 确保 selected 是数组
    const files = Array.isArray(selected) ? selected : [selected];

    // 显示导入中的消息
    const loadingMessage = ElMessage({
      message: `正在导入 ${files.length} 个文件...`,
      type: "info",
      duration: 0, // 不自动关闭
      showClose: true,
    });

    try {
      // 调用后端导入函数
      const result = await invoke("import_music", {
        files: files,
        defaultDirectory: props.currentDirectory || null,
      });

      // 关闭加载消息
      loadingMessage.close();

      // 显示成功消息
      ElMessage({
        message: result as string,
        type: "success",
        duration: 5000,
        showClose: true,
      });

      // 刷新音乐列表
      emit("refresh");
    } catch (error) {
      // 关闭加载消息
      loadingMessage.close();

      // 显示错误消息
      ElMessage({
        message: `导入失败: ${error}`,
        type: "error",
        duration: 5000,
        showClose: true,
      });
    }
  } catch (error) {
    console.error("打开文件对话框失败:", error);
    ElMessage({
      message: "打开文件选择对话框失败",
      type: "error",
      duration: 3000,
    });
  }
}

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
        <el-button
          @click="importMusic"
          :icon="Upload"
          type="warning"
          class="header-button"
          size="default"
          v-if="viewMode === ViewMode.LOCAL"
        >
          导入音乐
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

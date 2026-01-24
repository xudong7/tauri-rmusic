<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Search,
  Moon,
  Sunny,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Setting,
  Close,
  Upload,
} from "@element-plus/icons-vue";
import { ViewMode } from "@/types/model";
import { createSettingsWindow } from "@/utils/settingsWindow";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import { useWindowControls } from "@/composables/useWindowControls";

const props = defineProps<{
  currentDirectory: string;
  viewMode: ViewMode;
  isDarkMode: boolean;
}>();

const emit = defineEmits(["refresh", "search", "toggle-theme"]);

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

const router = useRouter();
const searchKeyword = ref("");
const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));

function handleSearch() {
  emit("search", searchKeyword.value);
}

async function openSettingWindow() {
  try {
    await createSettingsWindow();
  } catch (e) {
    console.error("打开设置窗口失败:", e);
  }
}

function toggleViewMode() {
  router.push(props.viewMode === ViewMode.LOCAL ? "/online" : "/");
}

function toggleTheme() {
  emit("toggle-theme");
}
</script>

<template>
  <div
    class="header-bar"
    :class="{ 'is-maximized': isMaximized, 'is-dark-mode': isDarkMode }"
  >
    <div class="header-left">
      <div class="nav-tabs">
        <div
          class="nav-tab"
          :class="{ 'is-active': viewMode === ViewMode.LOCAL }"
          @click="viewMode !== ViewMode.LOCAL && toggleViewMode()"
        >
          本地音乐
        </div>
        <div
          class="nav-tab"
          :class="{ 'is-active': viewMode === ViewMode.ONLINE }"
          @click="viewMode !== ViewMode.ONLINE && toggleViewMode()"
        >
          在线搜索
        </div>
      </div>
      <el-button
        v-if="viewMode === ViewMode.LOCAL"
        @click="importMusic"
        :icon="Upload"
        type="warning"
        class="header-button import-btn"
        size="default"
      >
        导入音乐
      </el-button>
    </div>

    <div class="header-center">
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          :placeholder="
            viewMode === ViewMode.LOCAL ? '搜索本地歌曲...' : '搜索在线歌曲...'
          "
          class="search-input search-pill"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon class="search-prefix-icon"><Search /></el-icon>
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
        <div class="header-button window-button" @click="openSettingWindow" title="设置">
          <el-icon><Setting /></el-icon>
        </div>
        <div class="header-button window-button" @click="minimize" title="最小化">
          <el-icon><Minus /></el-icon>
        </div>
        <div
          class="header-button window-button"
          @click="toggleMaximize"
          :title="isMaximized ? '还原' : '最大化'"
        >
          <el-icon><component :is="maximizeIcon" /></el-icon>
        </div>
        <div class="header-button window-button close" @click="close" title="关闭">
          <el-icon><Close /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./HeaderBar.css" />

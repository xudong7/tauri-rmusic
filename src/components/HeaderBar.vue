<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import {
  Folder,
  Search,
  Refresh,
  Switch,
  Moon,
  Sunny,
} from "@element-plus/icons-vue";
import { ViewMode } from "../types/model";

const props = defineProps<{
  currentDirectory: string;
  viewMode: ViewMode;
  isDarkMode: boolean;
  isAutoTheme: boolean;
}>();

const emit = defineEmits([
  "select-directory",
  "refresh",
  "search",
  "switch-view",
  "toggle-theme",
  "toggle-auto-theme",
]);

// 搜索关键字
const searchKeyword = ref("");

// 执行搜索
function handleSearch() {
  if (!searchKeyword.value.trim()) {
    ElMessage.info("请输入搜索关键词");
    return;
  }
  emit("search", searchKeyword.value);
}

// 切换视图模式
function toggleViewMode() {
  const newMode =
    props.viewMode === ViewMode.LOCAL ? ViewMode.ONLINE : ViewMode.LOCAL;
  emit("switch-view", newMode);
}

// 切换主题模式
function toggleTheme() {
  emit("toggle-theme");
}

// 切换自动主题
function toggleAutoTheme() {
  emit("toggle-auto-theme");
}
</script>

<template>
  <div class="header-bar">
    <div class="directory-section">
      <el-button
        @click="emit('select-directory')"
        :icon="Folder"
        type="primary"
        :disabled="viewMode === ViewMode.ONLINE"
      >
        选择目录
      </el-button>
      <el-button
        @click="emit('refresh')"
        :icon="Refresh"
        type="info"
        :disabled="viewMode === ViewMode.ONLINE"
      >
        刷新
      </el-button>
      <el-button
        @click="toggleViewMode"
        :icon="Switch"
        :type="viewMode === ViewMode.ONLINE ? 'success' : 'default'"
      >
        {{ viewMode === ViewMode.LOCAL ? "在线搜索" : "本地音乐" }}
      </el-button>
      <div v-if="viewMode === ViewMode.LOCAL" class="current-path">
        <span>{{ currentDirectory || "未选择" }}</span>
      </div>
    </div>

    <div class="right-controls">
      <div class="theme-controls">
        <el-tooltip :content="isDarkMode ? '切换到亮色模式' : '切换到暗色模式'">
          <el-button
            circle
            @click="toggleTheme"
            :icon="isDarkMode ? Moon : Sunny"
          />
        </el-tooltip>
      </div>

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
  </div>
</template>

<style scoped>
.header-bar {
  padding: 16px;
  background-color: var(--header-bg-color, var(--el-bg-color));
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.directory-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-path {
  margin-left: 10px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-path span {
  color: var(--el-color-primary);
  font-weight: bold;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.theme-controls {
  display: flex;
  align-items: center;
}

.search-section {
  width: 300px;
}

.search-input {
  width: 100%;
}

/* 暗色主题样式覆盖 */
:deep(.el-button) {
  --el-button-hover-bg-color: var(--hover-bg-color, rgba(255, 255, 255, 0.1));
  --el-button-hover-text-color: var(--el-color-primary);
}

:deep(.el-button--primary) {
  --el-button-hover-bg-color: var(--el-color-primary-light-3);
  --el-button-hover-border-color: var(--el-color-primary-light-3);
}

:deep(.el-button--info) {
  --el-button-hover-bg-color: var(--el-fill-color-light);
  --el-button-hover-border-color: var(--el-border-color-light);
}

:deep(.el-button--success) {
  --el-button-bg-color: var(--el-color-primary);
  --el-button-border-color: var(--el-color-primary);
  --el-button-hover-bg-color: var(--el-color-primary-light-3);
  --el-button-hover-border-color: var(--el-color-primary-light-3);
}

:deep(.el-button--default) {
  --el-button-bg-color: var(--el-fill-color-blank);
  --el-button-border-color: var(--el-border-color);
  --el-button-hover-bg-color: var(--hover-bg-color, rgba(255, 255, 255, 0.1));
  --el-button-hover-border-color: var(--el-color-primary);
  --el-button-hover-text-color: var(--el-color-primary);
}

:deep(.el-button.is-disabled) {
  --el-button-disabled-bg-color: var(--el-fill-color-blank);
  --el-button-disabled-border-color: var(--el-border-color-light);
  --el-button-disabled-text-color: var(--el-text-color-placeholder);
}
</style>

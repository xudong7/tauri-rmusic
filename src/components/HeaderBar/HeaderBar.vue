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
import { ViewMode } from "../../types/model";

const props = defineProps<{
  currentDirectory: string;
  viewMode: ViewMode;
  isDarkMode: boolean;
}>();

const emit = defineEmits([
  "select-directory",
  "refresh",
  "search",
  "switch-view",
  "toggle-theme",
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

<style scoped src="./HeaderBar.css" />

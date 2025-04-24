<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Folder, Search, Refresh, Switch } from '@element-plus/icons-vue';
import { ViewMode } from '../types/model';

const props = defineProps<{
  currentDirectory: string;
  viewMode: ViewMode;
}>();

const emit = defineEmits(['select-directory', 'refresh', 'search', 'switch-view']);

// 搜索关键字
const searchKeyword = ref('');

// 执行搜索
function handleSearch() {
  if (!searchKeyword.value.trim()) {
    ElMessage.info('请输入搜索关键词');
    return;
  }
  emit('search', searchKeyword.value);
}

// 切换视图模式
function toggleViewMode() {
  const newMode = props.viewMode === ViewMode.LOCAL ? ViewMode.ONLINE : ViewMode.LOCAL;
  emit('switch-view', newMode);
}
</script>

<template>
  <div class="header-bar">
    <div class="directory-section">
      <el-button @click="emit('select-directory')" :icon="Folder" type="primary" :disabled="viewMode === ViewMode.ONLINE">
        选择目录
      </el-button>
      <el-button @click="emit('refresh')" :icon="Refresh" type="info" :disabled="viewMode === ViewMode.ONLINE">
        刷新
      </el-button>
      <el-button @click="toggleViewMode" :icon="Switch" :type="viewMode === ViewMode.ONLINE ? 'success' : 'default'">
        {{ viewMode === ViewMode.LOCAL ? '在线搜索' : '本地音乐' }}
      </el-button>
      <div v-if="viewMode === ViewMode.LOCAL" class="current-path">
        当前目录: <span>{{ currentDirectory || '未选择' }}</span>
      </div>
    </div>
    
    <div class="search-section">
      <el-input
        v-model="searchKeyword"
        :placeholder="viewMode === ViewMode.LOCAL ? '搜索本地歌曲...' : '搜索在线歌曲...'"
        class="search-input"
        @keyup.enter="handleSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="handleSearch" />
        </template>
      </el-input>
    </div>
  </div>
</template>

<style scoped>
.header-bar {
  padding: 16px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
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
  color: #606266;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-path span {
  color: #409eff;
  font-weight: bold;
}

.search-section {
  width: 300px;
}

.search-input {
  width: 100%;
}
</style>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  Search,
  Moon,
  Sunny,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Close,
} from "@element-plus/icons-vue";
import { ViewMode } from "@/types/model";
import { useWindowControls } from "@/composables/useWindowControls";

const { t } = useI18n();

const props = defineProps<{
  viewMode: ViewMode;
  isDarkMode: boolean;
}>();

const emit = defineEmits(["search", "toggle-theme"]);

const searchKeyword = ref("");
const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));

function handleSearch() {
  emit("search", searchKeyword.value);
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
    <div class="header-left" />
    <div class="header-center">
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          :placeholder="
            viewMode === ViewMode.LOCAL
              ? t('search.placeholderLocal')
              : t('search.placeholderOnline')
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
          :title="isDarkMode ? t('header.switchToLight') : t('header.switchToDark')"
        >
          <el-icon>
            <component :is="isDarkMode ? Moon : Sunny" />
          </el-icon>
        </div>
        <div
          class="header-button window-button"
          @click="minimize"
          :title="t('header.minimize')"
        >
          <el-icon><Minus /></el-icon>
        </div>
        <div
          class="header-button window-button"
          @click="toggleMaximize"
          :title="isMaximized ? t('header.restore') : t('header.maximize')"
        >
          <el-icon><component :is="maximizeIcon" /></el-icon>
        </div>
        <div
          class="header-button window-button close"
          @click="close"
          :title="t('header.close')"
        >
          <el-icon><Close /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./HeaderBar.css" />

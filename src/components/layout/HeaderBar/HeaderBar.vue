<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Search,
  Minus,
  FullScreen,
  ScaleToOriginal,
  Close,
  Clock,
  Delete,
} from "@element-plus/icons-vue";
import { ViewMode } from "@/types/model";
import { useWindowControls } from "@/composables/useWindowControls";
import { useSearchHistoryStore } from "@/stores/searchHistoryStore";

const { t } = useI18n();
const searchHistoryStore = useSearchHistoryStore();

const props = defineProps<{
  viewMode: ViewMode;
  isDarkMode: boolean;
}>();

const emit = defineEmits(["search"]);

const searchKeyword = ref("");
const showHistoryDropdown = ref(false);
let blurTimer: ReturnType<typeof setTimeout> | null = null;

const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));

const historyList = computed(() => searchHistoryStore.getHistory(props.viewMode));

watch(
  () => props.viewMode,
  () => {
    showHistoryDropdown.value = false;
  }
);

function handleSearch() {
  const kw = searchKeyword.value.trim();
  if (kw) searchHistoryStore.add(kw, props.viewMode);
  showHistoryDropdown.value = false;
  emit("search", searchKeyword.value);
}

function onSearchFocus() {
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  showHistoryDropdown.value = true;
}

function onSearchBlur() {
  blurTimer = setTimeout(() => {
    showHistoryDropdown.value = false;
    blurTimer = null;
  }, 200);
}

function selectHistory(item: string) {
  searchKeyword.value = item;
  searchHistoryStore.add(item, props.viewMode);
  showHistoryDropdown.value = false;
  emit("search", item);
}

function removeHistoryItem(item: string, e: Event) {
  e.stopPropagation();
  searchHistoryStore.remove(item, props.viewMode);
}

function clearHistory(e: Event) {
  e.stopPropagation();
  searchHistoryStore.clear(props.viewMode);
  showHistoryDropdown.value = false;
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
        <div class="search-wrapper">
          <el-input
            v-model="searchKeyword"
            :placeholder="
              viewMode === ViewMode.LOCAL
                ? t('search.placeholderLocal')
                : t('search.placeholderOnline')
            "
            class="search-input search-pill"
            @keyup.enter="handleSearch"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
          >
            <template #prefix>
              <el-icon class="search-prefix-icon"><Search /></el-icon>
            </template>
          </el-input>
          <Transition name="history-dropdown">
            <div
              v-show="showHistoryDropdown"
              class="search-history-dropdown"
              @mousedown.prevent
            >
              <div class="search-history-header">
                <el-icon><Clock /></el-icon>
                <span>{{ t("search.historyTitle") }}</span>
                <button
                  v-if="historyList.length > 0"
                  type="button"
                  class="search-history-clear-btn"
                  @click="clearHistory"
                >
                  <el-icon><Delete /></el-icon>
                  <span>{{ t("search.clearHistory") }}</span>
                </button>
              </div>
              <div v-if="historyList.length > 0" class="search-history-chips">
                <button
                  v-for="item in historyList"
                  :key="item"
                  type="button"
                  class="search-history-chip"
                  @click="selectHistory(item)"
                >
                  <span class="search-history-chip-text">{{ item }}</span>
                  <span
                    class="search-history-chip-remove"
                    :aria-label="t('search.removeItem')"
                    @click="removeHistoryItem(item, $event)"
                  >
                    <el-icon><Close /></el-icon>
                  </span>
                </button>
              </div>
              <div v-else class="search-history-empty">
                {{ t("search.noHistory") }}
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="header-right">
      <div class="window-controls">
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

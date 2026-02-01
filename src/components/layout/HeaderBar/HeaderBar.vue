<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Close,
  Clock,
  Delete,
  FullScreen,
  Minus,
  ScaleToOriginal,
  Search,
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
const searchWrapperRef = ref<HTMLElement | null>(null);
/** 失焦后延迟关闭历史面板，避免点击历史项时误关 */
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
    const el = searchWrapperRef.value;
    if (el?.contains(document.activeElement)) {
      blurTimer = null;
      return;
    }
    showHistoryDropdown.value = false;
    blurTimer = null;
  }, 200);
}

function onSearchWrapperClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const dropdown = searchWrapperRef.value?.querySelector(".search-history-dropdown");
  if (dropdown?.contains(target)) return;
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  showHistoryDropdown.value = true;
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
        <div ref="searchWrapperRef" class="search-wrapper" @click="onSearchWrapperClick">
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
          :title="t('header.minimize')"
          @click="minimize"
        >
          <el-icon><Minus /></el-icon>
        </div>
        <div
          class="header-button window-button"
          :title="isMaximized ? t('header.restore') : t('header.maximize')"
          @click="toggleMaximize"
        >
          <el-icon><component :is="maximizeIcon" /></el-icon>
        </div>
        <div
          class="header-button window-button close"
          :title="t('header.close')"
          @click="close"
        >
          <el-icon><Close /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./HeaderBar.css" />

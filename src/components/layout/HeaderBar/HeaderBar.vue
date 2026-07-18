<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
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
import { ViewMode, type SearchScope } from "@/types/model";
import { useWindowControls } from "@/composables/useWindowControls";
import { useWindowDrag } from "@/composables/useWindowDrag";
import { useSearchHistoryStore } from "@/stores/searchHistoryStore";
import { useOnlineServiceStore } from "@/stores/onlineServiceStore";
import { usePlatform } from "@/composables/usePlatform";

const { t } = useI18n();
const searchHistoryStore = useSearchHistoryStore();
const onlineServiceStore = useOnlineServiceStore();

const props = defineProps<{
  searchScope: SearchScope | null;
  isDarkMode: boolean;
}>();

const emit = defineEmits<{
  search: [keyword: string, scope: SearchScope];
}>();

const searchKeywords = reactive<Record<SearchScope, string>>({
  local: "",
  online: "",
  playlist: "",
});
const searchKeyword = computed({
  get: () => (props.searchScope ? searchKeywords[props.searchScope] : ""),
  set: (value: string) => {
    if (props.searchScope) searchKeywords[props.searchScope] = value;
  },
});
const showHistoryDropdown = ref(false);
const searchWrapperRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<InstanceType<typeof import("element-plus").ElInput> | null>(
  null
);
/** 失焦后延迟关闭历史面板，避免点击历史项时误关 */
let blurTimer: ReturnType<typeof setTimeout> | null = null;

const { isMacPlatform } = usePlatform();
const searchShortcutLabel = computed(() => (isMacPlatform.value ? "⌘ K" : "Ctrl K"));

const { isMaximized, minimize, toggleMaximize, close } = useWindowControls({
  onClose: "hide",
});
const { startWindowDrag } = useWindowDrag();
const maximizeIcon = computed(() => (isMaximized.value ? ScaleToOriginal : FullScreen));
const supportsSearchHistory = computed(
  () => props.searchScope === "local" || props.searchScope === "online"
);
const historyMode = computed(() =>
  props.searchScope === "local" ? ViewMode.LOCAL : ViewMode.ONLINE
);
const historyList = computed(() =>
  supportsSearchHistory.value ? searchHistoryStore.getHistory(historyMode.value) : []
);
const searchPlaceholder = computed(() => {
  if (props.searchScope === "local") return t("search.placeholderLocal");
  if (props.searchScope === "playlist") return t("search.placeholderPlaylist");
  return t("search.placeholderOnline");
});
const onlineServiceStatusTitle = computed(() => {
  if (onlineServiceStore.state === "checking") return t("onlineService.checking");
  if (onlineServiceStore.state === "restarting") return t("onlineService.restarting");
  if (onlineServiceStore.isAvailable) return t("onlineService.available");
  return onlineServiceStore.message
    ? `${t("onlineService.unavailable")}: ${onlineServiceStore.message} · ${t("onlineService.clickToRestart")}`
    : `${t("onlineService.unavailable")} · ${t("onlineService.clickToRestart")}`;
});
const showOnlineServiceLabel = computed(
  () => props.searchScope === "online" && onlineServiceStore.state !== "available"
);

function handleOnlineServiceStatusClick() {
  if (onlineServiceStore.state === "unavailable") {
    void onlineServiceStore.restartService();
    return;
  }
  void onlineServiceStore.checkNow();
}

watch(
  () => props.searchScope,
  () => {
    showHistoryDropdown.value = false;
  }
);

function handleSearch() {
  if (!props.searchScope) return;
  const kw = searchKeyword.value.trim();
  if (kw && supportsSearchHistory.value) searchHistoryStore.add(kw, historyMode.value);
  showHistoryDropdown.value = false;
  emit("search", kw, props.searchScope);
}

function onSearchFocus() {
  clearBlurTimer();
  showHistoryDropdown.value = supportsSearchHistory.value;
}

function clearBlurTimer() {
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
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
  if (!supportsSearchHistory.value) return;
  clearBlurTimer();
  showHistoryDropdown.value = true;
}

function selectHistory(item: string) {
  if (!props.searchScope) return;
  searchKeyword.value = item;
  searchHistoryStore.add(item, historyMode.value);
  showHistoryDropdown.value = false;
  emit("search", item, props.searchScope);
}

function removeHistoryItem(item: string, e: Event) {
  e.stopPropagation();
  searchHistoryStore.remove(item, historyMode.value);
}

function clearHistory(e: Event) {
  e.stopPropagation();
  searchHistoryStore.clear(historyMode.value);
  showHistoryDropdown.value = false;
}

function handleSearchShortcut(event: KeyboardEvent) {
  if (!props.searchScope || event.key.toLowerCase() !== "k") return;
  if (!(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  searchInputRef.value?.focus();
}

onMounted(() => window.addEventListener("keydown", handleSearchShortcut));
onUnmounted(() => {
  clearBlurTimer();
  window.removeEventListener("keydown", handleSearchShortcut);
});
</script>

<template>
  <div
    class="header-bar"
    :class="{
      'is-maximized': isMaximized,
      'is-dark-mode': isDarkMode,
      'is-mac-platform': isMacPlatform,
    }"
    @mousedown="startWindowDrag"
  >
    <div class="header-left" />
    <div class="header-center">
      <div class="search-section">
        <div
          v-if="searchScope"
          ref="searchWrapperRef"
          class="search-wrapper"
          @click="onSearchWrapperClick"
        >
          <el-input
            ref="searchInputRef"
            v-model="searchKeyword"
            :placeholder="searchPlaceholder"
            clearable
            class="search-input search-pill"
            @keyup.enter="handleSearch"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
          >
            <template #prefix>
              <el-icon class="search-prefix-icon"><Search /></el-icon>
            </template>
            <template #suffix>
              <kbd class="search-shortcut">{{ searchShortcutLabel }}</kbd>
            </template>
          </el-input>
          <Transition name="history-dropdown">
            <div
              v-show="showHistoryDropdown && supportsSearchHistory"
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
              <div v-if="historyList.length > 0" class="search-history-list">
                <div v-for="item in historyList" :key="item" class="search-history-item">
                  <button
                    type="button"
                    class="search-history-item-action"
                    @click="selectHistory(item)"
                  >
                    <span class="search-history-item-text">{{ item }}</span>
                  </button>
                  <button
                    type="button"
                    class="search-history-item-remove"
                    :aria-label="t('search.removeItem')"
                    @click="removeHistoryItem(item, $event)"
                  >
                    <el-icon><Close /></el-icon>
                  </button>
                </div>
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
      <el-tooltip
        v-if="searchScope === 'online'"
        :content="onlineServiceStatusTitle"
        placement="bottom"
        effect="light"
      >
        <button
          type="button"
          class="service-status app-header-icon-button"
          :class="[
            `is-${onlineServiceStore.state}`,
            { 'has-label': showOnlineServiceLabel },
          ]"
          :aria-label="onlineServiceStatusTitle"
          @click.stop="handleOnlineServiceStatusClick"
        >
          <span class="service-status-dot" />
          <span v-if="showOnlineServiceLabel" class="service-status-label">
            {{ onlineServiceStatusTitle }}
          </span>
        </button>
      </el-tooltip>
      <!-- 非 macOS 平台显示窗口控制按钮 -->
      <div v-if="!isMacPlatform" class="window-controls">
        <button
          type="button"
          class="header-button window-button"
          :title="t('header.minimize')"
          @click="minimize"
        >
          <el-icon><Minus /></el-icon>
        </button>
        <button
          type="button"
          class="header-button window-button"
          :title="isMaximized ? t('header.restore') : t('header.maximize')"
          @click="toggleMaximize"
        >
          <el-icon><component :is="maximizeIcon" /></el-icon>
        </button>
        <button
          type="button"
          class="header-button window-button close"
          :title="t('header.close')"
          @click="close"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./HeaderBar.css" />

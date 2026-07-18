<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Brush,
  CircleCheck,
  CopyDocument,
  Download,
  InfoFilled,
  Delete,
  FolderOpened,
  RefreshLeft,
  Refresh,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { open } from "@tauri-apps/plugin-dialog";
import { useThemeStore, type ThemeMode } from "@/stores/themeStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useOnlineServiceStore } from "@/stores/onlineServiceStore";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { setLocale, getLocale, type LocaleKey } from "@/i18n";
import {
  clearOnlineAudioCache,
  getOnlineAudioCachePath,
  getOnlineAudioCacheSize,
} from "@/api/commands/music";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";

const { t } = useI18n();
const themeStore = useThemeStore();
const localStore = useLocalMusicStore();
const onlineServiceStore = useOnlineServiceStore();
const downloadPath = ref("");
const autoStartEnabled = ref(false);
const currentLocale = ref<LocaleKey>(getLocale());
const onlineCacheSize = ref(0);
const onlineCachePath = ref("");
const clearingCache = ref(false);
const serviceStatusLabel = computed(() => {
  if (onlineServiceStore.state === "checking") return t("onlineService.checking");
  if (onlineServiceStore.state === "restarting") return t("onlineService.restarting");
  return onlineServiceStore.isAvailable
    ? t("onlineService.available")
    : t("onlineService.unavailable");
});

watch(
  () => localStore.defaultDirectory,
  (directory) => {
    if (directory) downloadPath.value = directory;
  },
  { immediate: true }
);

async function refreshOnlineService() {
  await onlineServiceStore.ensureStarted();
  await onlineServiceStore.checkNow();
}

const localeOptions: { value: LocaleKey; labelKey: string }[] = [
  { value: "zh", labelKey: "settings.languageZh" },
  { value: "en", labelKey: "settings.languageEn" },
];

function handleLocaleChange(val: LocaleKey) {
  setLocale(val);
  currentLocale.value = val;
}

const themeOptions: { value: ThemeMode; labelKey: string }[] = [
  { value: "light", labelKey: "common.light" },
  { value: "dark", labelKey: "common.dark" },
  { value: "warm", labelKey: "common.warm" },
];

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

async function refreshOnlineCacheSize() {
  onlineCacheSize.value = await getOnlineAudioCacheSize();
}

async function refreshOnlineCachePath() {
  onlineCachePath.value = await getOnlineAudioCachePath();
}

async function copyPath(path: string) {
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    ElMessage.success(t("messages.pathCopied"));
  } catch (error) {
    console.error("复制路径失败:", error);
  }
}

async function handleClearOnlineCache() {
  clearingCache.value = true;
  try {
    await clearOnlineAudioCache();
    await refreshOnlineCacheSize();
    ElMessage.success(t("messages.cacheCleared"));
  } catch (error) {
    ElMessage.error(`${t("errors.clearCacheFailed")}: ${error}`);
  } finally {
    clearingCache.value = false;
  }
}

function handleThemeModeChange(val: ThemeMode) {
  themeStore.setThemeMode(val);
}

// 选择下载目录
const selectDownloadPath = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("settings.selectDownloadLocation"),
      defaultPath: downloadPath.value || undefined,
    });

    if (selected && typeof selected === "string") {
      downloadPath.value = selected;
      await localStore.setDefaultDirectory(selected);
    }
  } catch (error) {
    console.error("选择下载目录失败:", error);
  }
};

// 重置下载目录为默认
const resetDownloadPath = async () => {
  try {
    await localStore.resetDefaultDirectory();
    // 更新显示的路径
    const currentDefaultDir = localStore.getDefaultDirectory();
    if (currentDefaultDir) {
      downloadPath.value = currentDefaultDir;
    }
  } catch (error) {
    console.error("重置下载目录失败:", error);
  }
};

// 处理开机自启动状态变化
const handleAutoStartChange = async (value: boolean) => {
  try {
    if (value) {
      await enable();
    } else {
      await disable();
    }
  } catch (error) {
    console.error("设置开机自启动失败:", error);
    // 如果设置失败，恢复原状态
    autoStartEnabled.value = !value;
  }
};

onMounted(async () => {
  try {
    const dir = localStore.getDefaultDirectory();
    if (dir) downloadPath.value = dir;
    await refreshOnlineCachePath();
    await refreshOnlineCacheSize();
    try {
      autoStartEnabled.value = await isEnabled();
    } catch (e) {
      console.error("获取开机自启动状态失败:", e);
    }
  } catch (e) {
    console.error("Settings window error:", e);
  }
});
</script>

<template>
  <div class="settings-window">
    <PageLayout class="settings-content" scroll>
      <PageHeader :title="t('settings.title')" />
      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Brush /></el-icon> {{ t("settings.appearance") }}
        </h3>
        <div class="setting-row">
          <label>{{ t("settings.themeMode") }}</label>
          <div class="setting-control">
            <el-select
              :model-value="themeStore.themeMode"
              class="theme-select"
              @update:model-value="handleThemeModeChange"
            >
              <el-option
                v-for="opt in themeOptions"
                :key="opt.value"
                :value="opt.value"
                :label="t(opt.labelKey)"
              />
            </el-select>
          </div>
        </div>
        <div class="setting-row">
          <label>{{ t("settings.language") }}</label>
          <div class="setting-control">
            <el-select
              v-model="currentLocale"
              @change="handleLocaleChange"
              class="locale-select"
            >
              <el-option
                v-for="opt in localeOptions"
                :key="opt.value"
                :value="opt.value"
                :label="t(opt.labelKey)"
              />
            </el-select>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><CircleCheck /></el-icon> {{ t("settings.appSettings") }}
        </h3>
        <div class="setting-row">
          <label>{{ t("settings.autoStart") }}</label>
          <div class="setting-control">
            <el-switch v-model="autoStartEnabled" @change="handleAutoStartChange" />
          </div>
        </div>
        <div class="setting-row">
          <label>{{ t("settings.serviceStatus") }}</label>
          <div class="setting-control service-control">
            <span
              class="service-state"
              :class="`is-${onlineServiceStore.state}`"
              role="status"
            >
              <span class="service-state-dot" />
              {{ serviceStatusLabel }}
            </span>
            <el-button
              circle
              :icon="Refresh"
              :loading="onlineServiceStore.isChecking || onlineServiceStore.isRestarting"
              :aria-label="t('settings.refreshService')"
              class="settings-action-btn app-icon-button"
              @click="refreshOnlineService"
            />
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Download /></el-icon> {{ t("settings.download") }}
        </h3>
        <div class="setting-row">
          <label>{{ t("settings.downloadLocation") }}</label>
          <div class="setting-actions">
            <el-tooltip :content="t('common.browse')" placement="top">
              <el-button
                circle
                type="primary"
                :icon="FolderOpened"
                class="settings-action-btn app-icon-button app-icon-button--primary"
                @click="selectDownloadPath"
              />
            </el-tooltip>
            <el-tooltip :content="t('common.reset')" placement="top">
              <el-button
                circle
                :icon="RefreshLeft"
                class="settings-action-btn app-icon-button"
                @click="resetDownloadPath"
              />
            </el-tooltip>
          </div>
        </div>
        <div class="path-summary">
          <span class="path-summary-label">{{ t("settings.libraryRoot") }}</span>
          <code class="path-summary-value" :title="downloadPath">{{ downloadPath }}</code>
          <el-button
            link
            :icon="CopyDocument"
            class="path-copy"
            @click="copyPath(downloadPath)"
          />
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Delete /></el-icon> {{ t("settings.cache") }}
        </h3>
        <div class="setting-row">
          <label>{{ t("settings.onlineAudioCache") }}</label>
          <div class="setting-control cache-control">
            <span class="cache-size">{{ formatBytes(onlineCacheSize) }}</span>
            <el-tooltip :content="t('settings.clearCache')" placement="top">
              <el-button
                circle
                :icon="Delete"
                :loading="clearingCache"
                class="settings-action-btn settings-danger-action app-icon-button app-icon-button--danger"
                @click="handleClearOnlineCache"
              />
            </el-tooltip>
          </div>
        </div>
        <div class="path-summary">
          <span class="path-summary-label">{{ t("settings.cachePath") }}</span>
          <code class="path-summary-value" :title="onlineCachePath">{{
            onlineCachePath || "-"
          }}</code>
          <el-button
            link
            :icon="CopyDocument"
            class="path-copy"
            @click="copyPath(onlineCachePath)"
          />
        </div>
      </div>

      <div class="settings-section settings-about">
        <h3 class="section-title">
          <el-icon><InfoFilled /></el-icon> {{ t("settings.about") }}
        </h3>
        <div class="setting-row about-content">
          <p class="about-desc">{{ t("settings.aboutDesc") }}</p>
        </div>
      </div>
    </PageLayout>
  </div>
</template>

<style scoped src="./SettingsWindow.css" />

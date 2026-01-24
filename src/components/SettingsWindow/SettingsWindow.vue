<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  FolderOpened,
  Brush,
  CircleCheck,
  Download,
  InfoFilled,
} from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useMusicStore } from "@/stores/musicStore";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { setLocale, getLocale, type LocaleKey } from "@/i18n";

const { t } = useI18n();
const musicStore = useMusicStore();
const downloadPath = ref("");
const autoStartEnabled = ref(false);
const currentLocale = ref<LocaleKey>(getLocale());

const localeOptions: { value: LocaleKey; labelKey: string }[] = [
  { value: "zh", labelKey: "settings.languageZh" },
  { value: "en", labelKey: "settings.languageEn" },
];

function handleLocaleChange(val: LocaleKey) {
  setLocale(val);
  currentLocale.value = val;
}

watch(
  () => musicStore.isDarkMode,
  () => musicStore.applyTheme()
);

window.addEventListener("storage", (e) => {
  if (e.key === "theme" && e.newValue) {
    const shouldBeDark = e.newValue === "dark";
    if (musicStore.isDarkMode !== shouldBeDark)
      musicStore.setThemeWithoutSave(shouldBeDark);
  }
});

// 主题切换处理
const handleThemeChange = (value: boolean) => {
  // 使用新的 setTheme 方法
  musicStore.setTheme(value);
  console.log("Theme changed to:", value ? "dark" : "light");
};

// 选择下载目录
const selectDownloadPath = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("settings.selectDownloadLocation"),
    });

    if (selected && typeof selected === "string") {
      downloadPath.value = selected;
      await musicStore.setDefaultDirectory(selected);
    }
  } catch (error) {
    console.error("选择下载目录失败:", error);
  }
};

// 重置下载目录为默认
const resetDownloadPath = async () => {
  try {
    await musicStore.resetDefaultDirectory();
    // 更新显示的路径
    const currentDefaultDir = musicStore.getDefaultDirectory();
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
      console.log("开机自启动已启用");
    } else {
      await disable();
      console.log("开机自启动已禁用");
    }
  } catch (error) {
    console.error("设置开机自启动失败:", error);
    // 如果设置失败，恢复原状态
    autoStartEnabled.value = !value;
  }
};

onMounted(async () => {
  try {
    await musicStore.initialize();
    const dir = musicStore.getDefaultDirectory();
    if (dir) downloadPath.value = dir;
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
    <div class="settings-content">
      <h2 class="settings-page-title">{{ t("settings.title") }}</h2>
      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Brush /></el-icon> {{ t("settings.appearance") }}
        </h3>
        <div class="setting-item">
          <label>{{ t("settings.themeMode") }}</label>
          <div class="setting-control">
            <el-switch
              v-model="musicStore.isDarkMode"
              :active-text="t('common.dark')"
              :inactive-text="t('common.light')"
              @change="handleThemeChange"
            />
          </div>
        </div>
        <div class="setting-item">
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
        <div class="setting-item">
          <label>{{ t("settings.autoStart") }}</label>
          <div class="setting-control">
            <el-switch
              v-model="autoStartEnabled"
              :active-text="t('common.enable')"
              :inactive-text="t('common.disable')"
              @change="handleAutoStartChange"
            />
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">
          <el-icon><Download /></el-icon> {{ t("settings.download") }}
        </h3>
        <div class="setting-item">
          <label>{{ t("settings.downloadLocation") }}</label>
          <div class="download-path-container">
            <el-input
              v-model="downloadPath"
              :placeholder="t('settings.selectDownloadLocation')"
              readonly
              class="download-path-input"
            />
            <el-button @click="selectDownloadPath" :icon="FolderOpened" type="primary">
              {{ t("common.browse") }}
            </el-button>
            <el-button @click="resetDownloadPath" type="default">
              {{ t("common.reset") }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="settings-section settings-about">
        <h3 class="section-title">
          <el-icon><InfoFilled /></el-icon> {{ t("settings.about") }}
        </h3>
        <div class="setting-item about-content">
          <p class="about-version">{{ t("settings.version") }}</p>
          <p class="about-desc">{{ t("settings.aboutDesc") }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./SettingsWindow.css" />

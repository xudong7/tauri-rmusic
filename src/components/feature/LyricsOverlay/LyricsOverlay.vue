<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Close } from "@element-plus/icons-vue";
import { STORAGE_KEY_LYRICS_FONT_SIZE, STORAGE_KEY_THEME } from "@/constants";
import {
  LYRICS_OVERLAY_CLOSED_EVENT,
  LYRICS_OVERLAY_READY_EVENT,
  LYRICS_OVERLAY_UPDATE_EVENT,
  type LyricsOverlayPayload,
} from "@/composables/useLyricsBroadcast";

const { t } = useI18n();

const MIN_FONT_SIZE = 18;
const MAX_FONT_SIZE = 44;
const DEFAULT_FONT_SIZE = 28;

const payload = ref<LyricsOverlayPayload>({ current: "", translation: "", next: "" });
const fontSize = ref(readFontSize());
const hasLyric = computed(() => Boolean(payload.value.current));

let unlistenUpdate: UnlistenFn | null = null;

function clampFontSize(value: number): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, value));
}

function readFontSize(): number {
  const stored = Number.parseInt(
    localStorage.getItem(STORAGE_KEY_LYRICS_FONT_SIZE) ?? "",
    10
  );
  return clampFontSize(Number.isNaN(stored) ? DEFAULT_FONT_SIZE : stored);
}

function adjustFontSize(delta: number) {
  fontSize.value = clampFontSize(fontSize.value + delta);
  localStorage.setItem(STORAGE_KEY_LYRICS_FONT_SIZE, String(fontSize.value));
}

/** 悬浮窗是独立 webview，不经过 themeStore；直接按存储的主题给根元素打类 */
function applyTheme() {
  const mode = localStorage.getItem(STORAGE_KEY_THEME);
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.classList.toggle("theme-warm", mode === "warm");
}

function handleStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY_THEME) applyTheme();
}

async function closeOverlay() {
  void emit(LYRICS_OVERLAY_CLOSED_EVENT);
  try {
    await getCurrentWindow().close();
  } catch (error) {
    console.error("关闭桌面歌词失败:", error);
  }
}

onMounted(async () => {
  applyTheme();
  window.addEventListener("storage", handleStorage);
  unlistenUpdate = await listen<LyricsOverlayPayload>(
    LYRICS_OVERLAY_UPDATE_EVENT,
    (event) => {
      payload.value = event.payload;
    }
  );
  // 通知主窗补发一次当前歌词：本监听建立前推送的那条会丢
  void emit(LYRICS_OVERLAY_READY_EVENT);
});

onUnmounted(() => {
  unlistenUpdate?.();
  unlistenUpdate = null;
  window.removeEventListener("storage", handleStorage);
});
</script>

<template>
  <!-- 整窗可拖动；控件不带 data-tauri-drag-region，点按不会触发拖窗 -->
  <div class="lyrics-overlay" data-tauri-drag-region>
    <div class="lyrics-overlay__controls">
      <button
        type="button"
        class="lyrics-overlay__control"
        :aria-label="t('lyricsOverlay.fontSizeSmaller')"
        @click="adjustFontSize(-2)"
      >
        A−
      </button>
      <button
        type="button"
        class="lyrics-overlay__control"
        :aria-label="t('lyricsOverlay.fontSizeLarger')"
        @click="adjustFontSize(2)"
      >
        A＋
      </button>
      <button
        type="button"
        class="lyrics-overlay__control"
        :aria-label="t('lyricsOverlay.close')"
        @click="closeOverlay"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <template v-if="hasLyric">
      <p
        class="lyrics-overlay__current"
        data-tauri-drag-region
        :style="{ fontSize: `${fontSize}px` }"
      >
        {{ payload.current }}
      </p>
      <p
        v-if="payload.translation"
        class="lyrics-overlay__translation"
        data-tauri-drag-region
        :style="{ fontSize: `${Math.round(fontSize * 0.78)}px` }"
      >
        {{ payload.translation }}
      </p>
      <p
        v-if="payload.next"
        class="lyrics-overlay__next"
        data-tauri-drag-region
        :style="{ fontSize: `${Math.round(fontSize * 0.7)}px` }"
      >
        {{ payload.next }}
      </p>
    </template>
    <p v-else class="lyrics-overlay__idle" data-tauri-drag-region>
      {{ t("lyricsOverlay.idle") }}
    </p>
  </div>
</template>

<style scoped>
.lyrics-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 18px;
  box-sizing: border-box;
  overflow: hidden;
  text-align: center;
  user-select: none;
  cursor: default;
}

/* 白字 + 双层深色投影：不依赖窗口底色，压在亮/暗桌面上都能读 */
.lyrics-overlay__current {
  margin: 0;
  max-width: 100%;
  color: #fff;
  font-weight: 700;
  line-height: 1.25;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.9),
    0 0 10px rgba(0, 0, 0, 0.6);
  overflow-wrap: anywhere;
}

.lyrics-overlay__translation {
  margin: 0;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.86);
  font-weight: 500;
  line-height: 1.3;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.85),
    0 0 8px rgba(0, 0, 0, 0.55);
  overflow-wrap: anywhere;
}

.lyrics-overlay__next {
  margin: 2px 0 0;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
  line-height: 1.3;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  overflow-wrap: anywhere;
}

.lyrics-overlay__idle {
  margin: 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.lyrics-overlay__controls {
  position: absolute;
  top: 4px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.lyrics-overlay:hover .lyrics-overlay__controls,
.lyrics-overlay__controls:focus-within {
  opacity: 1;
}

.lyrics-overlay__control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--app-radius-full, 9999px);
  background: rgba(20, 24, 28, 0.55);
  color: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.lyrics-overlay__control:hover,
.lyrics-overlay__control:focus-visible {
  background: rgba(20, 24, 28, 0.82);
}
</style>

<!-- 悬浮窗的 html/body 必须透明，否则窗口的透明背景上会盖一层默认白 -->
<style>
html.lyrics-window,
html.lyrics-window body {
  background: transparent !important;
  overflow: hidden;
}
</style>

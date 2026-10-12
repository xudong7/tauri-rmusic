<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Close } from "@element-plus/icons-vue";
import { usePlatform } from "@/composables/usePlatform";
import { useShortcutsHelp } from "@/composables/useShortcutsHelp";

const { t } = useI18n();
const { isMacPlatform } = usePlatform();
const { isShortcutsHelpOpen, closeShortcutsHelp } = useShortcutsHelp();

const closeButtonRef = ref<HTMLButtonElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
/** 打开前的焦点：关闭后要还回去，否则键盘用户会掉到 body 上 */
let previouslyFocused: HTMLElement | null = null;

const shortcutItems = computed(() => [
  { keys: ["Space"], label: t("shortcuts.playPause") },
  { keys: ["←"], label: t("shortcuts.previous") },
  { keys: ["→"], label: t("shortcuts.next") },
  { keys: [isMacPlatform.value ? "⌘ K" : "Ctrl K"], label: t("shortcuts.search") },
  { keys: ["Esc"], label: t("shortcuts.closePanels") },
  { keys: ["?"], label: t("shortcuts.showHelp") },
]);

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !isShortcutsHelpOpen.value) return;
  // 标记这次 Esc 已被消费：全局快捷键靠 defaultPrevented 判断该不该继续
  // 关队列 / 退沉浸，否则一个按键会连关两层
  event.preventDefault();
  event.stopPropagation();
  closeShortcutsHelp();
}

/**
 * 弹层打开期间把应用主体设为惰性：读屏与 Tab 都不该再走到背后的界面。
 * inert 在旧版 WebKit 上没有实现，所以同时挂 aria-hidden 兜底——两者一起
 * 摘除即可，不会互相干扰。焦点先移进弹层再设置，避免「隐藏了仍持有焦点的
 * 后代」这种非法状态。
 */
function setBackgroundInert(inert: boolean) {
  const app = document.getElementById("app");
  if (!app) return;
  if (inert) {
    app.setAttribute("inert", "");
    app.setAttribute("aria-hidden", "true");
  } else {
    app.removeAttribute("inert");
    app.removeAttribute("aria-hidden");
  }
}

/** Tab 循环锁在弹层里：只有一枚可聚焦元素时，Tab 与 Shift+Tab 都停在它身上 */
function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const focusables = dialogRef.value?.querySelectorAll<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
  );
  if (!focusables || focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (focusables.length === 1) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(isShortcutsHelpOpen, async (open) => {
  if (open) {
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    closeButtonRef.value?.focus();
    setBackgroundInert(true);
    return;
  }
  setBackgroundInert(false);
  previouslyFocused?.focus();
  previouslyFocused = null;
});

onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  // 组件在弹层打开时被卸载（例如整页重挂载）也要把惰性属性摘掉
  setBackgroundInert(false);
});
</script>

<template>
  <Teleport to="body">
    <template v-if="isShortcutsHelpOpen">
      <div class="shortcuts-backdrop" @mousedown="closeShortcutsHelp" />
      <div
        ref="dialogRef"
        class="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('shortcuts.title')"
        @keydown="handleDialogKeydown"
      >
        <header class="shortcuts-dialog__header">
          <h2>{{ t("shortcuts.title") }}</h2>
          <button
            ref="closeButtonRef"
            type="button"
            class="shortcuts-dialog__close"
            :aria-label="t('header.close')"
            @click="closeShortcutsHelp"
          >
            <el-icon><Close /></el-icon>
          </button>
        </header>
        <ul class="shortcuts-dialog__list">
          <li
            v-for="item in shortcutItems"
            :key="item.label"
            class="shortcuts-dialog__row"
          >
            <span class="shortcuts-dialog__label">{{ item.label }}</span>
            <span class="shortcuts-dialog__keys">
              <kbd v-for="key in item.keys" :key="key" class="shortcuts-dialog__key">{{
                key
              }}</kbd>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.shortcuts-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.4);
}

.shortcuts-dialog {
  position: fixed;
  z-index: 2501;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(400px, calc(100vw - 48px));
  padding: 16px 18px 10px;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--app-radius-lg);
  background: var(--el-bg-color-overlay);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.shortcuts-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.shortcuts-dialog__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: var(--el-text-color-primary);
}

.shortcuts-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-icon-btn-sm);
  height: var(--app-icon-btn-sm);
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-full);
  background: transparent;
  color: var(--app-icon-button-color);
  cursor: pointer;
  transition: color var(--app-control-transition);
}

.shortcuts-dialog__close:hover,
.shortcuts-dialog__close:focus-visible {
  color: var(--app-icon-button-hover-color);
}

.shortcuts-dialog__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.shortcuts-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 36px;
  border-top: 1px solid var(--app-surface-border);
}

.shortcuts-dialog__row:first-child {
  border-top: 0;
}

.shortcuts-dialog__label {
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.shortcuts-dialog__keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.shortcuts-dialog__key {
  min-width: 22px;
  padding: 2px 6px;
  border: 1px solid var(--app-surface-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-subtle-surface);
  color: var(--el-text-color-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.4;
  text-align: center;
}
</style>

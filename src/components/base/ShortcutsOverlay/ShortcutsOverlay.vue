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

const shortcutItems = computed(() => [
  { keys: ["Space"], label: t("shortcuts.playPause") },
  { keys: ["←"], label: t("shortcuts.previous") },
  { keys: ["→"], label: t("shortcuts.next") },
  { keys: [isMacPlatform.value ? "⌘ K" : "Ctrl K"], label: t("shortcuts.search") },
  { keys: ["Esc"], label: t("shortcuts.closePanels") },
  { keys: ["?"], label: t("shortcuts.showHelp") },
]);

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && isShortcutsHelpOpen.value) {
    event.stopPropagation();
    closeShortcutsHelp();
  }
}

watch(isShortcutsHelpOpen, async (open) => {
  if (!open) return;
  await nextTick();
  closeButtonRef.value?.focus();
});

onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <template v-if="isShortcutsHelpOpen">
      <div class="shortcuts-backdrop" @mousedown="closeShortcutsHelp" />
      <div
        class="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('shortcuts.title')"
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

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useContextMenu } from "@/composables/useContextMenu";

const { state, close, select } = useContextMenu();
const menuRef = ref<HTMLElement | null>(null);
const position = ref({ left: 0, top: 0 });

watch(
  () => state.value,
  async (value) => {
    if (!value) return;
    // 先按光标落位，渲染后再量实际尺寸把菜单夹回视口内
    position.value = { left: value.x, top: value.y };
    await nextTick();
    clampToViewport();
    menuRef.value?.querySelector<HTMLButtonElement>(".context-menu__item")?.focus();
  }
);

function clampToViewport() {
  const el = menuRef.value;
  if (!el) return;
  const margin = 8;
  const rect = el.getBoundingClientRect();
  position.value = {
    left: Math.max(
      margin,
      Math.min(position.value.left, window.innerWidth - rect.width - margin)
    ),
    top: Math.max(
      margin,
      Math.min(position.value.top, window.innerHeight - rect.height - margin)
    ),
  };
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

function handleMenuKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const buttons = Array.from(
    menuRef.value?.querySelectorAll<HTMLButtonElement>(".context-menu__item") ?? []
  );
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex = currentIndex + (event.key === "ArrowDown" ? 1 : -1);
  const target = buttons[Math.max(0, Math.min(nextIndex, buttons.length - 1))];
  if (!target) return;
  event.preventDefault();
  target.focus();
}

onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <template v-if="state">
      <!-- 整屏背板负责「点外面关闭」。用 mousedown 而不是 click：
           在菜单上按下、拖出去松开不该被当成「点外面」。 -->
      <div
        class="context-menu__backdrop"
        aria-hidden="true"
        @mousedown="close"
        @contextmenu.prevent="close"
      />
      <div
        ref="menuRef"
        class="context-menu"
        role="menu"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        @keydown="handleMenuKeydown"
        @contextmenu.prevent
      >
        <button
          v-for="item in state.items"
          :key="item.key"
          type="button"
          role="menuitem"
          class="context-menu__item"
          :class="{ 'is-danger': item.danger }"
          :disabled="item.disabled"
          @click="select(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.context-menu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 2400;
}

/* 系统菜单的观感：不透明面板、细描边、紧凑行高；不用毛玻璃——
   右键菜单是即时出现的元素，半透明会让它看起来比内容层轻。 */
.context-menu {
  position: fixed;
  z-index: 2401;
  min-width: 176px;
  max-width: 260px;
  padding: 4px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--app-radius-md);
  background: var(--el-bg-color-overlay);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}

.context-menu__item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background var(--app-control-transition);
}

.context-menu__item:hover:not(:disabled),
.context-menu__item:focus-visible:not(:disabled) {
  background: var(--hover-bg-color);
}

.context-menu__item.is-danger {
  color: var(--el-color-danger);
}

.context-menu__item:disabled {
  color: var(--el-text-color-placeholder);
  cursor: default;
}
</style>

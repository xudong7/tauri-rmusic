<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useContextMenu, type ContextMenuItem } from "@/composables/useContextMenu";

const { state, close, select } = useContextMenu();
const menuRef = ref<HTMLElement | null>(null);
const position = ref({ left: 0, top: 0 });

/* ---------- 二级菜单 ---------- */

const openSubmenuKey = ref<string | null>(null);
const submenuRef = ref<HTMLElement | null>(null);
const submenuPosition = ref({ left: 0, top: 0 });
let hideSubmenuTimer: number | null = null;

watch(
  () => state.value,
  async (value) => {
    if (!value) {
      openSubmenuKey.value = null;
      return;
    }
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

function cancelHideSubmenu() {
  if (hideSubmenuTimer !== null) {
    clearTimeout(hideSubmenuTimer);
    hideSubmenuTimer = null;
  }
}

/** 指针从父项滑向子菜单会经过一小段空隙，延迟收起而不是立刻 */
function scheduleHideSubmenu() {
  cancelHideSubmenu();
  hideSubmenuTimer = window.setTimeout(() => {
    openSubmenuKey.value = null;
    hideSubmenuTimer = null;
  }, 120);
}

async function showSubmenu(item: ContextMenuItem, event: Event) {
  cancelHideSubmenu();
  if (!item.children?.length) return;
  openSubmenuKey.value = item.key;
  await nextTick();

  const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  const submenu = submenuRef.value;
  if (!anchor || !submenu) return;

  const margin = 8;
  const width = submenu.offsetWidth;
  const height = submenu.offsetHeight;
  // 默认贴父项右侧；右边放不下就翻到左侧，上下同样夹回视口
  let left = anchor.right + 2;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, anchor.left - width - 2);
  }
  let top = anchor.top - 4;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - height - margin);
  }
  submenuPosition.value = { left, top };
}

function handleItemClick(item: ContextMenuItem, event: MouseEvent) {
  if (item.children?.length) {
    void showSubmenu(item, event);
    return;
  }
  select(item.key);
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
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  cancelHideSubmenu();
});
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
        <div v-for="item in state.items" :key="item.key" class="context-menu__row">
          <button
            type="button"
            role="menuitem"
            class="context-menu__item"
            :class="{ 'is-danger': item.danger }"
            :disabled="item.disabled"
            :aria-haspopup="item.children?.length ? 'menu' : undefined"
            @click="handleItemClick(item, $event)"
            @mouseenter="showSubmenu(item, $event)"
            @mouseleave="scheduleHideSubmenu"
            @keydown.right.prevent="showSubmenu(item, $event)"
          >
            <span class="context-menu__label">{{ item.label }}</span>
            <span
              v-if="item.children?.length"
              class="context-menu__chevron"
              aria-hidden="true"
              >›</span
            >
          </button>

          <div
            v-if="item.children?.length && openSubmenuKey === item.key"
            ref="submenuRef"
            class="context-menu context-menu__submenu"
            role="menu"
            :style="{
              left: `${submenuPosition.left}px`,
              top: `${submenuPosition.top}px`,
            }"
            @mouseenter="cancelHideSubmenu"
            @mouseleave="scheduleHideSubmenu"
            @keydown.left.prevent="openSubmenuKey = null"
          >
            <button
              v-for="child in item.children"
              :key="child.key"
              type="button"
              role="menuitem"
              class="context-menu__item"
              :class="{ 'is-danger': child.danger }"
              :disabled="child.disabled"
              @click="select(child.key)"
            >
              <span class="context-menu__label">{{ child.label }}</span>
            </button>
          </div>
        </div>
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
  min-width: 188px;
  max-width: 280px;
  padding: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-lg);
  background: var(--el-bg-color-overlay);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.16),
    0 2px 8px rgba(0, 0, 0, 0.08);
  animation: context-menu-in 0.12s ease-out;
}

@keyframes context-menu-in {
  from {
    opacity: 0;
    transform: translateY(-3px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .context-menu {
    animation: none;
  }
}

.context-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--app-radius-md);
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--app-control-transition),
    color var(--app-control-transition);
}

.context-menu__row {
  position: relative;
}

.context-menu__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu__chevron {
  flex-shrink: 0;
  opacity: 0.55;
  font-size: 14px;
  line-height: 1;
}

/* 二级菜单盖在父菜单之上；定位坐标在脚本里按父项矩形计算 */
.context-menu__submenu {
  z-index: 2402;
}

.context-menu__item:hover:not(:disabled),
.context-menu__item:focus-visible:not(:disabled) {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}

.context-menu__item.is-danger {
  color: var(--el-color-danger);
}

.context-menu__item.is-danger:hover:not(:disabled),
.context-menu__item.is-danger:focus-visible:not(:disabled) {
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  color: var(--el-color-danger);
}

.context-menu__item:disabled {
  color: var(--el-text-color-placeholder);
  cursor: default;
}
</style>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Delete } from "@element-plus/icons-vue";
import QueueRow from "@/components/feature/PlaybackQueue/QueueRow.vue";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { QUEUE_ROW_HEIGHT } from "@/constants";
import type { PlaybackQueueItem } from "@/types/model";

const props = defineProps<{
  items: PlaybackQueueItem[];
  isPlaying: boolean;
  /** 本地封面目录：由主窗随队列一起推来 */
  defaultDirectory: string | null;
}>();

const emit = defineEmits<{
  play: [index: number];
  clear: [];
}>();

const { t } = useI18n();

const itemsRef = computed(() => props.items);
const { useVirtual, virtualList, scrollTo, containerProps, wrapperProps } =
  useVirtualListWhenLong<PlaybackQueueItem>({
    source: itemsRef,
    itemHeight: QUEUE_ROW_HEIGHT,
  });

/** 虚拟滚动下 DOM 里的位置和真实下标对不上，隔行底色要带真实下标走 */
const renderedRows = computed(() =>
  useVirtual.value
    ? virtualList.value.map(({ data, index }) => ({ item: data, index }))
    : props.items.map((item, index) => ({ item, index }))
);

const { getCover, scheduleMany } = useLocalCoverCache<PlaybackQueueItem>({
  getKey: (item) => item.coverFileName ?? item.key,
  getFileName: (item) => item.coverFileName ?? "",
  getDefaultDirectory: () => props.defaultDirectory,
});

// 只给渲染出来的行排封面。队列在无显式队列时会退化成整个本地曲库，
// 全量调度等于一次性排上千次 IPC。
watch(
  renderedRows,
  (rows) =>
    scheduleMany(rows.map(({ item }) => item).filter((item) => item.coverFileName)),
  { immediate: true }
);

function resolveCover(item: PlaybackQueueItem): string {
  if (item.coverUrl) return item.coverUrl;
  return item.coverFileName ? getCover(item) : "";
}

/** 打开面板时把当前曲目滚进视野 */
function scrollToCurrent() {
  const index = props.items.findIndex((item) => item.isCurrent);
  if (index < 0) return;
  if (!useVirtual.value) {
    containerProps.ref.value
      ?.querySelector<HTMLElement>(".is-current")
      ?.scrollIntoView({ block: "center" });
    return;
  }
  // 虚拟化后当前行通常不在 DOM 里，scrollIntoView 会静默失效，必须按索引滚。
  // scrollTo 把目标行对齐到容器顶部，这里减去半屏，保持与 block:"center" 一致。
  const viewportHeight = containerProps.ref.value?.clientHeight ?? 0;
  const half = Math.floor(viewportHeight / QUEUE_ROW_HEIGHT / 2);
  scrollTo(Math.max(0, index - half));
}

/**
 * 清空是两步确认：迷你窗只有 340px 宽，弹不下主窗那种确认框。
 * 第一次点击把按钮切成「确定」，3 秒内再点一次才真正清空。
 */
const CONFIRM_TIMEOUT_MS = 3000;
const confirmingClear = ref(false);
let confirmTimer: number | null = null;

function handleClearClick() {
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    confirmTimer = window.setTimeout(() => {
      confirmingClear.value = false;
      confirmTimer = null;
    }, CONFIRM_TIMEOUT_MS);
    return;
  }
  if (confirmTimer !== null) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
  confirmingClear.value = false;
  emit("clear");
}

// 队列是异步推来的：挂载时可能还是空的，等它第一次到齐再定位当前曲目。
// 只定位一次，之后用户自己滚到哪儿就是哪儿。
let didScrollToCurrent = false;
watch(
  () => props.items.length,
  (length) => {
    if (didScrollToCurrent || length === 0) return;
    didScrollToCurrent = true;
    void nextTick(scrollToCurrent);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (confirmTimer !== null) clearTimeout(confirmTimer);
});
</script>

<template>
  <div class="mini-queue">
    <header class="mini-queue__header" data-tauri-drag-region>
      <div class="mini-queue__heading" data-tauri-drag-region>
        <h2 data-tauri-drag-region>{{ t("playerBar.queue") }}</h2>
        <p data-tauri-drag-region>
          {{ t("miniPlayer.queueCount", { count: items.length }) }}
        </p>
      </div>
      <button
        v-if="items.length"
        type="button"
        class="mini-queue__clear"
        :class="{ 'is-confirming': confirmingClear }"
        :title="confirmingClear ? t('common.confirm') : t('playerBar.clearQueue')"
        :aria-label="confirmingClear ? t('common.confirm') : t('playerBar.clearQueue')"
        @click="handleClearClick"
      >
        <span v-if="confirmingClear">{{ t("common.confirm") }}</span>
        <el-icon v-else><Delete /></el-icon>
      </button>
    </header>

    <!-- tabindex 让滚动容器可聚焦：虚拟化后只有可视窗口内的行在 DOM 里，
         键盘用户没有别的手段滚动这个列表 -->
    <div
      v-if="items.length"
      v-bind="containerProps"
      class="mini-queue__list"
      :tabindex="useVirtual ? 0 : undefined"
      :aria-label="t('playerBar.queue')"
    >
      <div v-bind="wrapperProps" class="mini-queue__rows" role="list">
        <QueueRow
          v-for="row in renderedRows"
          :key="row.item.key"
          :item="row.item"
          :index="row.index"
          :is-playing="isPlaying"
          :cover-url="resolveCover(row.item)"
          @play="emit('play', row.item.sourceIndex)"
        />
      </div>
    </div>
    <p v-else class="mini-queue__empty">{{ t("playerBar.queueEmpty") }}</p>
  </div>
</template>

<style scoped src="./MiniPlayerQueue.css" />

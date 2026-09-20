<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Headset } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";
import type { PlaybackQueueItem } from "@/types/model";
import { useVirtualListWhenLong } from "@/composables/useVirtualListWhenLong";
import { useLocalCoverCache } from "@/composables/useLocalCoverCache";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import QueueRow from "./QueueRow.vue";
import { QUEUE_ROW_HEIGHT } from "@/constants";

const { t } = useI18n();
const props = defineProps<{
  items: PlaybackQueueItem[];
  title: string;
  isPlaying: boolean;
}>();
const emit = defineEmits<{
  close: [];
  play: [index: number];
}>();

const panelRef = ref<HTMLElement | null>(null);
const currentIndex = computed(() => props.items.findIndex((item) => item.isCurrent));

// 没有显式队列时，playbackQueueItems 会退化成整个本地曲库，
// 裸 v-for 会在一次 patch 里建出成千上万个节点。行高固定，适合虚拟化。
const itemsRef = computed(() => props.items);
const { useVirtual, virtualList, scrollTo, containerProps, wrapperProps } =
  useVirtualListWhenLong<PlaybackQueueItem>({
    source: itemsRef,
    itemHeight: QUEUE_ROW_HEIGHT,
  });

/** 实际渲染出来的行：虚拟滚动下是可视窗口，否则是全部。
 *  连真实下标一起带出来——隔行底色靠它，而虚拟滚动下 DOM 里的位置
 *  和真实下标对不上（:nth-child 会随滚动漂移）。 */
const renderedRows = computed(() =>
  useVirtual.value
    ? virtualList.value.map(({ data, index }) => ({ item: data, index }))
    : props.items.map((item, index) => ({ item, index }))
);

// 虚拟化和普通渲染只差绑定与数据源，合成一层，免得行标记写两份。
// 两份的代价不是洁癖：任何一行的改动都要同步两次，漏一次就会出现
// 「队列短的时候对、长的时候不对」这种按长度变化的诡异 bug。
const containerBindings = computed(() => (useVirtual.value ? containerProps : {}));
const wrapperBindings = computed(() => (useVirtual.value ? wrapperProps : {}));

const localMusicStore = useLocalMusicStore();
const { getCover, scheduleMany: scheduleCoverLoads } =
  useLocalCoverCache<PlaybackQueueItem>({
    // 缓存键取文件名而不是行 key：播放列表模式下行 key 含 sourceIndex，
    // 列表一重排同一首歌就换了 key，缓存会白做。
    getKey: (item) => item.coverFileName ?? item.key,
    getFileName: (item) => item.coverFileName ?? "",
    getDefaultDirectory: () => localMusicStore.getDefaultDirectory(),
  });

// 只给渲染出来的行排封面。队列在无显式队列时会退化成整个本地曲库，
// 全量调度等于一次性排上千次 IPC。
watch(
  renderedRows,
  (rows) =>
    scheduleCoverLoads(rows.map(({ item }) => item).filter((item) => item.coverFileName)),
  { immediate: true }
);

function resolveCover(item: PlaybackQueueItem): string {
  if (item.coverUrl) return item.coverUrl;
  return item.coverFileName ? getCover(item) : "";
}

onMounted(async () => {
  await nextTick();
  panelRef.value?.focus();
  if (currentIndex.value < 0) return;
  if (!useVirtual.value) {
    panelRef.value?.querySelector<HTMLElement>(".is-current")?.scrollIntoView({
      block: "center",
    });
    return;
  }
  // 虚拟化后当前曲目通常不在 DOM 里，scrollIntoView 会静默失效，必须按索引滚。
  // scrollTo 把目标行对齐到容器顶部，这里减去半屏，保持与上面 block:"center" 一致。
  const viewportHeight = containerProps.ref.value?.clientHeight ?? 0;
  const half = Math.floor(viewportHeight / QUEUE_ROW_HEIGHT / 2);
  scrollTo(Math.max(0, currentIndex.value - half));
});

/**
 * 只处理 Escape。原先还把 Tab 圈在面板里，那是模态对话框的做法；
 * 现在面板是停靠式的，主页列表要能继续用，Tab 就该能走出去。
 */
function handlePanelKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}
</script>

<template>
  <div class="queue-layer">
    <!-- 不加 aria-modal：面板打开时主页照常可滚动可点击，宣称模态会让读屏
         把下面的内容当成惰性的，与实际行为相反。 -->
    <aside
      ref="panelRef"
      class="queue-panel"
      tabindex="-1"
      role="dialog"
      :aria-label="t('playerBar.queue')"
      @keydown="handlePanelKeydown"
    >
      <header class="queue-header">
        <div class="queue-heading">
          <h2>{{ t("playerBar.queue") }}</h2>
          <p>{{ title || t("playerBar.currentQueue") }}</p>
        </div>
      </header>

      <!-- tabindex 让滚动容器本身可聚焦：虚拟化之后只有可视窗口内的行在
           DOM 里，键盘用户没法 Tab 到窗口之外的行，也就没有任何用键盘
           滚动这个列表的手段。聚焦容器后方向键/PageDown 可以滚动，
           新进入窗口的行随即变得可 Tab。
           普通渲染时不给 tabindex，免得容器变成一个多余的 Tab 落点。 -->
      <div
        v-if="items.length"
        v-bind="containerBindings"
        class="queue-list"
        :data-render-mode="useVirtual ? 'virtual' : 'standard'"
        :tabindex="useVirtual ? 0 : undefined"
        :aria-label="t('playerBar.queue')"
      >
        <div v-bind="wrapperBindings" class="queue-rows" role="list">
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

      <div v-else class="queue-empty">
        <el-icon><Headset /></el-icon>
        <p>{{ t("playerBar.queueEmpty") }}</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* 停靠式面板，不是模态遮罩：这一层只负责把面板摆到右侧，本身不吃指针事件，
   也不铺遮罩。主页列表因此照常可以滚动、可以点歌——面板打开的是一块
   额外空间，不是把下面的内容锁住。 */
.queue-layer {
  position: fixed;
  inset: var(--app-header-height) 0 var(--app-player-height) 0;
  /* 要盖过沉浸模式（z-index 1000）：沉浸页底部播放栏也能开队列面板 */
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.queue-panel {
  /* 420px 来自参考图：面板占 848→1320，除以该截图标度 1.15 约 410px。
     曲目信息改成一行后更依赖宽度，350px 会把长标题挤没。 */
  width: min(420px, calc(100vw - 32px));
  height: 100%;
  /* 上层整层不吃指针事件，只有面板自己吃 */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
  background: var(--app-overlay-panel-bg);
  /* 面板是停靠式的一块，不是浮起来的浮层，所以不打投影；
     与主页的分界交给这条左边框。 */
  border-left: 1px solid var(--app-surface-border);
  outline: none;
}

/* 只剩标题一块，不再需要两端对齐 */
.queue-header {
  min-height: 64px;
  padding: 10px 16px 9px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--app-surface-border);
}

.queue-heading {
  min-width: 0;
}

.queue-heading h2,
.queue-heading p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-heading h2 {
  font-size: 16px;
  font-weight: 650;
}

.queue-heading p {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.queue-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  /* 与 TrackList / EntityGrid 保持一致：内容从不可滚动变为可滚动时，
     预留的滚动条槽位能避免整列横向跳动。 */
  scrollbar-gutter: stable;
  scroll-padding-block: 8px;
}

/* 内边距放在包裹层而非滚动容器上：虚拟滚动用 scrollTop 算行偏移，
   容器上的 padding 会让每行实际位置与计算值差一个固定量。 */
.queue-rows {
  padding: 6px;
  box-sizing: border-box;
}

/* 行的样式（.queue-item 及其内部）都在 QueueRow.vue 自己的 scoped 里：
   scoped CSS 的作用域标记只落在本组件模板渲染出的元素上，子组件内部的
   元素匹配不到这里的规则。 */

.queue-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
}

.queue-empty .el-icon {
  font-size: 28px;
}

.queue-empty p {
  margin: 0;
  font-size: 13px;
}

/* ---------- 进出场 ----------
   App.vue 用 <Transition name="queue"> 包住本组件，下面这些类名由那边加上来，
   但规则留在这里：scoped 会给最后一个复合选择器补上 [data-v-*]，正好压过
   .queue-panel 自己那条声明；放进 App.vue 的全局块里就只是同特异性拼源码
   顺序，组件哪天改成异步加载就会翻盘。

   原先是一条挂载时跑一次的 CSS animation（queue-slide-in），删掉是必须的
   而不是顺手清理：动画的优先级高于普通 transition 会盖掉滑动，而且它在
   .queue-panel 上、Vue 等的是根的 transition，animationend 会被
   e.target === el 过滤掉，两套机制各说各话。 */

/* 淡出必须写在根元素 .queue-layer 上。Vue 判断退场结束读的是过渡根元素自己的
   transition：只写在下层 .queue-panel 上的话，它解析不出过渡类型就当场摘节点，
   滑动根本播不完。根的 transition 里只列 opacity——列上不会变的属性会让每次
   退场都退化成等超时，而不是由 transitionend 触发。 */
.queue-layer.queue-enter-active {
  transition: opacity var(--app-motion-enter) var(--app-motion-ease-out);
}

.queue-layer.queue-leave-active {
  /* 收起比常规退场长一截、走减速曲线：面板是整块滑出去的，太快会像被抽走 */
  transition: opacity 240ms var(--app-motion-ease-out);
}

/* 面板本体横滑。时长与曲线必须与根用同一组 token：根的 -active 类一摘，
   这里整条 transition 声明就跟着消失，正在跑的滑动会被掐断直接跳到终值——
   进场时根已经完全不透明，掐断是看得见的。 */
.queue-enter-active .queue-panel {
  transition: transform var(--app-motion-enter) var(--app-motion-ease-out);
}

.queue-leave-active .queue-panel {
  transition: transform 240ms var(--app-motion-ease-out);
}

.queue-enter-from,
.queue-leave-to {
  opacity: 0;
}

/* 进场只挪一点（画面基本是淡入），退场整块滑出面板宽度——「收回」要看得见 */
.queue-enter-from .queue-panel {
  transform: translateX(22px);
}

.queue-leave-to .queue-panel {
  transform: translateX(100%);
}

/* 收起途中面板已经没用了，别再让它吃掉 140ms 的点击。
   挂 -leave-active 而不是 -leave-to：后者要等两帧 rAF 才加上，会漏掉开头。
   三重选择器是为了压过 .queue-panel 自己的 pointer-events: auto。 */
.queue-layer.queue-leave-active .queue-panel {
  pointer-events: none;
}
</style>

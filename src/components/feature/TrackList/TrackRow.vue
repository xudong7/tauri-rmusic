<script setup lang="ts">
import { computed } from "vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import PlayingBars from "@/components/base/PlayingBars/PlayingBars.vue";
import PlayIcon from "@/components/base/icons/PlayIcon.vue";
import type { TrackRowModel } from "./types";

const props = withDefaults(
  defineProps<{
    item: TrackRowModel;
    /** 在源数组里的真实下标，用于隔行底色。
        虚拟滚动下 DOM 里的位置和真实下标对不上，所以不能交给 :nth-child。 */
    index?: number;
    selectionMode?: boolean;
    selected?: boolean;
    /** 当前曲目（由 TrackList 与 currentKey 比较得出）。 */
    isCurrent?: boolean;
    /** 是否正在播放；只在 isCurrent 时有意义。 */
    isPlaying?: boolean;
    /**
     * 操作簇要常驻。槽内容里有东西正在进行/刚完成/待重试时由调用方置真——
     * 操作簇默认悬停才显示，鼠标一移开，进度或结果就跟着消失了。
     */
    busy?: boolean;
    rowHeight?: number;
  }>(),
  {
    index: 0,
    selectionMode: false,
    selected: false,
    isCurrent: false,
    isPlaying: false,
    busy: false,
    rowHeight: undefined,
  }
);

const emit = defineEmits<{
  activate: [item: TrackRowModel];
  toggleSelect: [item: TrackRowModel];
}>();

const resolvedCoverUrl = computed(() =>
  typeof props.item.coverUrl === "function" ? props.item.coverUrl() : props.item.coverUrl
);

function handleRowClick() {
  if (props.selectionMode) {
    emit("toggleSelect", props.item);
    return;
  }
  handleActivate();
}

function handleActivate() {
  if (props.selectionMode || props.item.disabled) return;
  emit("activate", props.item);
}
</script>

<template>
  <div
    class="track-row"
    :class="{
      'is-current': isCurrent && !selectionMode,
      'is-selected': selected,
      'is-disabled': item.disabled,
      'is-striped': props.index % 2 === 0,
      'is-busy': busy,
    }"
    :style="
      rowHeight ? { height: `${rowHeight}px`, minHeight: `${rowHeight}px` } : undefined
    "
    :title="`${item.title} — ${item.artist}`"
    :tabindex="item.disabled ? -1 : 0"
    role="listitem"
    :aria-current="isCurrent ? 'true' : undefined"
    :aria-disabled="item.disabled || undefined"
    @click="handleRowClick"
    @keydown.enter.self.prevent="handleRowClick"
    @keydown.space.self.prevent="handleRowClick"
  >
    <!-- 封面兼作播放控件。播放键原先单独占最左侧一格，把封面挤离了行首，
         整行因此不是左对齐的；挪到封面上之后行首就是封面，也不需要再为
         那一格留出列宽。 -->
    <div class="track-row__cover">
      <CoverImage :src="resolvedCoverUrl" alt="" :size="40" :radius="7" />
      <div v-if="selectionMode" class="track-row__cover-check">
        <el-checkbox
          :model-value="selected"
          :aria-label="item.title"
          @click.stop
          @change="emit('toggleSelect', item)"
        />
      </div>
      <button
        v-else
        type="button"
        class="track-row__cover-play"
        :class="{ 'is-current': isCurrent }"
        :disabled="item.disabled"
        :aria-label="item.title"
        @click.stop="handleActivate()"
      >
        <!-- 播放/暂停的表达与队列面板逐字一致：播放中出跳动条，否则出播放三角。
             图标不带圈，全项目统一用 PlayIcon/PauseIcon——Element Plus 的
             VideoPlay 会把三角套进圆圈里，叠在封面上就像多了个边框。 -->
        <PlayingBars v-if="isCurrent && isPlaying" />
        <el-icon v-else class="track-row__play-icon"><PlayIcon /></el-icon>
      </button>
    </div>

    <!-- 操作按钮并进这一列并右对齐：它们原先是网格最后一列，离歌名很远，
         挪进来之后与歌名同属一块，右对齐贴住本列末尾。 -->
    <div class="track-row__main">
      <div class="track-row__text">
        <div class="track-row__title" :class="{ 'is-playing': isCurrent }">
          {{ item.title }}
        </div>
        <div class="track-row__meta">{{ item.artist }}</div>
      </div>
      <div v-if="$slots.actions && !selectionMode" class="track-row__actions" @click.stop>
        <slot name="actions" :item="item" />
      </div>
    </div>

    <div v-if="item.album" class="track-row__album" :title="item.album">
      {{ item.album }}
    </div>

    <div v-if="item.durationLabel" class="track-row__duration">
      {{ item.durationLabel }}
    </div>
  </div>
</template>

<style scoped>
.track-row {
  position: relative;
  min-height: var(--app-track-row-height);
  margin-bottom: 0;
  padding: var(--app-track-row-padding-y) var(--app-track-row-padding-x);
  /* 右侧再多留一段空档，网格因此不贴行尾——时长是最后一格，它的右边缘就是
     网格的右边缘，不留空档就顶到行尾了。行盒仍铺满整行，底色/悬停/条纹不变。 */
  padding-right: calc(var(--app-track-row-padding-x) + var(--app-track-end-gap));
  display: grid;
  /* 封面 40 + 主列 + 专辑 + 时长。操作按钮不再是独立列，所以在线曲目也
     不需要更宽的最后一列，.track-row--online 那个变体一并去掉。

     网格从 --app-track-grid 来，没有断点变体；列头（TrackList）读同一份，
     两边各写一份迟早会错开——这里曾经就差了一格。 */
  grid-template-columns: var(--app-track-grid);
  align-items: center;
  gap: var(--app-track-row-gap);
  box-sizing: border-box;
  border-radius: var(--app-radius-md);
  cursor: pointer;
  transition:
    background var(--app-control-transition),
    color var(--app-control-transition);
  outline: none;
}

/* 隔行底色。必须排在这一组的最前面：悬停、选中、聚焦与它特异性相同
   （都是 0,2,0），靠源码顺序决定胜负，后面几条要能盖住它。 */
.track-row.is-striped {
  background: var(--app-row-stripe-bg);
}

.track-row:hover {
  background: var(--hover-bg-color);
}

.track-row.is-current,
.track-row.is-selected {
  background: var(--active-item-bg);
}

.track-row.is-current {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.track-row:focus-visible {
  background: var(--hover-bg-color);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 52%, transparent);
}

.track-row.is-current::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 50%;
  border-radius: 0 var(--app-radius-full) var(--app-radius-full) 0;
  background: var(--el-color-primary);
  transform: translateY(-50%);
}

.track-row.is-disabled {
  cursor: default;
  opacity: 0.5;
}

.track-row__cover {
  grid-column: 1;
  position: relative;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border-radius: var(--app-radius-sm);
}

.track-row__cover-play,
.track-row__cover-check {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

/* 播放三角直接叠在封面上，不套任何底色方框——悬停时的反馈就是它自己亮起来。
   没有底色托底，改用投影保证浅色封面上也看得见。 */
.track-row__cover-play {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.78);
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  opacity: 0;
  transition:
    opacity var(--app-control-transition),
    color var(--app-control-transition),
    filter var(--app-control-transition);
}

/* 悬停/聚焦才浮出，当前曲目常驻——与队列面板把播放态叠在封面上一致 */
.track-row:hover .track-row__cover-play,
.track-row:focus-within .track-row__cover-play,
.track-row__cover-play.is-current {
  opacity: 1;
}

/* 指针落到图标本身时「微微发亮」：颜色提到纯白，再补一层白色光晕 */
.track-row__cover-play:hover,
.track-row__cover-play:focus-visible {
  color: #ffffff;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6))
    drop-shadow(0 0 6px rgba(255, 255, 255, 0.6));
  outline: none;
}

/* 选择框需要自己的底：它是个小方框轮廓，直接压在画面上会看不清 */
.track-row__cover-check {
  background: rgba(0, 0, 0, 0.44);
  color: #fff;
}

.track-row__main {
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-row__text {
  flex: 1;
  min-width: 0;
}

.track-row__album {
  /* 倒数第二格。必须写成 -3 / -2（起线 / 止线）这样的区间，不能只给一个
     grid-column: -2：负数是「从显式网格末尾倒数第几条线」，单独一个负线号
     作起始线，元素就落在显式网格之外，浏览器会为它新生成一格——整行因此
     右移一格，专辑挤进时长那格，而列头不会跟着动。 */
  grid-column: -3 / -2;
  /* 填满格子即可。宽度由轨道（minmax(140px, 0.45fr)）决定，格子里的元素
     不要再自己定一次——这里原先另写了一个 clamp(140px, 20vw, 260px)，比轨道
     还宽，最多溢出 40px，盖过 12px 的 gap 之后压进时长那一格。 */
  width: 100%;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-row__title,
.track-row__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0;
}

/* 行高由封面撑出来（40 + 上下内边距各 8 = 56），文字只需不超即可。
   显式给 1.3 的行高：默认 leading 下两行约 40px，会让行高对不上
   虚拟滚动用的 LIST_ROW_HEIGHT。参考图实测文字行距 20px。 */
.track-row__title {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
}

.track-row__title.is-playing {
  color: var(--el-color-primary);
  font-weight: 600;
}

.track-row__meta {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.track-row__duration {
  /* 最后一格，同样要写成线到线的区间（理由见上面 .track-row__album）。
     另外曲目没有专辑信息时 .track-row__album 根本不渲染（v-if），靠自动排列
     会让时长顶到专辑那格，所以这里必须钉死。 */
  grid-column: -2 / -1;
  min-width: 40px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.track-row__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--app-control-transition);
}

.track-row:hover .track-row__actions,
.track-row:focus-within .track-row__actions {
  opacity: 1;
  pointer-events: auto;
}

/* 槽内容标记为进行中的行，操作簇常驻：鼠标一移开，进度或结果就跟着消失，
   而这些恰恰是用户要看的（成功提示已经没有 toast 兜底了）。 */
.track-row.is-busy .track-row__actions {
  opacity: 1;
  pointer-events: auto;
}

:deep(.track-row__actions .el-button) {
  width: var(--list-row-btn-size);
  height: var(--list-row-btn-size);
  padding: 0;
  border: 1px solid transparent;
  color: var(--app-icon-button-color);
  background: transparent;
  transition:
    background var(--app-control-transition),
    border-color var(--app-control-transition),
    color var(--app-control-transition),
    transform var(--app-control-transition),
    box-shadow var(--app-control-transition);
}

/* 加载中的按钮会被 Element Plus 盖一层 --el-mask-color-extra-light
   （rgba(255,255,255,.3)）的遮罩。浅色下看不出来，深色下是一整块发白圆斑，
   而这一簇的按钮约定是只有图标、不浮出底色（见下面的 hover 规则），
   遮罩在这里没有存在意义。 */
:deep(.track-row__actions .el-button.is-loading::before) {
  display: none;
}

/* 与全项目一致：悬停只让图标亮起来，不浮出底色方块。
   显式写 background/border 是为了压过全局 .el-button.is-link:hover 的底色。 */
:deep(.track-row__actions .el-button:hover) {
  color: var(--app-icon-button-hover-color);
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.track-row__play-icon {
  font-size: 18px;
}

@media (hover: none) {
  .track-row__actions,
  .track-row__cover-play {
    opacity: 1;
    pointer-events: auto;
  }
}

/* 没有窄屏变体：网格来自 --app-track-grid，任何窗口宽度下都放得下，
   专辑列不必收起，行也就不会重排。
   原先 1100px 以下会收起专辑列、改用 .track-row__meta-album 把专辑塞回
   歌手那一行。既然专辑列常驻，那条补偿路径就没有存在意义了。 */

/* 降低动效时静止的那份由 PlayingBars 自己处理 */
</style>

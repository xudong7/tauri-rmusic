<script setup lang="ts">
import { VideoPlay } from "@element-plus/icons-vue";
import type { PlaybackQueueItem } from "@/types/model";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import PlayingBars from "@/components/base/PlayingBars/PlayingBars.vue";
import { QUEUE_COVER_RADIUS, QUEUE_COVER_SIZE, QUEUE_ROW_HEIGHT } from "@/constants";

defineProps<{
  item: PlaybackQueueItem;
  isPlaying: boolean;
  /** 封面地址由上层解析：本地封面要经 IPC 异步取，这里只管渲染 */
  coverUrl: string;
}>();

const emit = defineEmits<{ play: [] }>();
</script>

<template>
  <button
    type="button"
    class="queue-item"
    :class="{ 'is-current': item.isCurrent }"
    :style="{ height: `${QUEUE_ROW_HEIGHT}px`, minHeight: `${QUEUE_ROW_HEIGHT}px` }"
    :disabled="item.disabled"
    :aria-current="item.isCurrent ? 'true' : undefined"
    @click="emit('play')"
  >
    <!-- 尺寸与圆角都从常量来：CSS 读不到 TS 常量，写死在样式里迟早和
         CoverImage 的 :size/:radius 对不上。 -->
    <span
      class="queue-item-cover"
      :style="{
        width: `${QUEUE_COVER_SIZE}px`,
        height: `${QUEUE_COVER_SIZE}px`,
        borderRadius: `${QUEUE_COVER_RADIUS}px`,
      }"
    >
      <CoverImage
        :src="coverUrl"
        alt=""
        :size="QUEUE_COVER_SIZE"
        :radius="QUEUE_COVER_RADIUS"
      />
      <!-- 当前曲目的播放状态原先在序号列，序号列取消后挪到封面上。
           容器有 overflow: hidden，遮罩自然被裁成封面那圈圆角。
           这里的判断与曲库列表逐字一致：播放中出跳动条，否则出带圈的播放键。 -->
      <span v-if="item.isCurrent" class="queue-item-state">
        <PlayingBars v-if="isPlaying" />
        <el-icon v-else><VideoPlay /></el-icon>
      </span>
    </span>
    <span class="queue-item-main">
      <strong>{{ item.title }}</strong>
      <span class="queue-item-artist">{{ item.artist }}</span>
    </span>
  </button>
</template>

<style scoped>
.queue-item {
  width: 100%;
  /* 上下 8px 与主页列表行一致：34px 封面 + 16px 内边距 = 50px 行高 */
  padding: 8px;
  display: grid;
  /* 只有封面和文字两列：序号列已按参考图去掉 */
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.queue-item:hover,
.queue-item:focus-visible {
  background: var(--hover-bg-color);
  outline: none;
}

.queue-item.is-current {
  color: var(--el-color-primary);
  background: var(--active-item-bg);
}

.queue-item:disabled {
  opacity: 0.48;
  cursor: default;
}

.queue-item-cover {
  position: relative;
  display: block;
  overflow: hidden;
  flex-shrink: 0;
  /* 消除行内元素基线留出的空隙，否则封面会比设定值高几像素 */
  line-height: 0;
}

.queue-item-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.46);
  color: #fff;
  font-size: 15px;
}

/* 歌名与歌手排成一行。两段都允许收缩并各自省略：长标题先让位，
   短标题时长歌手才截断。整行 nowrap，不需要横向滚动。 */
.queue-item-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  white-space: nowrap;
  overflow: hidden;
}

.queue-item-main strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
}

.queue-item-artist {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

/* 分隔点跟着歌手走：整段歌手被截没时，孤零零一个点反而像是坏掉了 */
.queue-item-artist::before {
  content: " · ";
}
</style>

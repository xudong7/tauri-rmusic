<script setup lang="ts">
/**
 * 「正在播放」的三条跳动竖线。
 *
 * 曲库列表和队列面板都要用它标记当前曲目，所以抽出来共用——两处各写一份
 * 迟早会走样，而这正是它存在的意义：让两个列表对「正在播放」的表达一致。
 */
</script>

<template>
  <span class="playing-bars" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
</template>

<style scoped>
.playing-bars {
  width: 16px;
  height: 15px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
}

.playing-bars i {
  width: 2px;
  border-radius: var(--app-radius-full);
  background: currentColor;
  animation: playing-bars 0.8s ease-in-out infinite alternate;
}

.playing-bars i:nth-child(1) {
  height: 8px;
  animation-delay: -0.45s;
}

.playing-bars i:nth-child(2) {
  height: 14px;
  animation-delay: -0.2s;
}

.playing-bars i:nth-child(3) {
  height: 10px;
  animation-delay: -0.65s;
}

@keyframes playing-bars {
  to {
    height: 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .playing-bars i {
    animation: none;
  }
}
</style>

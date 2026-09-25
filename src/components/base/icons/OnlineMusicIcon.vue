<script setup lang="ts">
/**
 * 在线音乐：一朵云，里面一个音符。
 *
 * 侧栏这一项原先用 Element Plus 的 Search（放大镜），那说的是「去找东西」，
 * 而不是「这里是在线音乐」——搜索只是这个页面里的一种用法，不是它的身份。
 *
 * 云 + 音符而不是单纯一个音符：音符只说得出「音乐」，说不出「在线」，同排的
 * 曲库里就全是音乐了，这一项要区分的是来源。云是「在线」最通用的形状，而
 * 音符嵌在云里（而不是浮在云上）是刻意的——两片形状叠着画在 18px 下会糊成
 * 一团，实测过，嵌进去才两样都看得清。
 *
 * EP 里没有音符图标，Headset 那类又只表示「在听」，所以自绘。
 */
</script>

<template>
  <svg
    class="online-music-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M5.8 20H17.4c2.5 0 4.5-2 4.5-4.5S19.9 11 17.4 11c-.2 0-.5 0-.7.05C16 7.4 13.4 5.2 10.3 5.2 6.8 5.2 4 7.8 3.6 11.1 2.1 11.7 1 13.2 1 14.9 1 17.7 3.3 20 6.1 20Z"
      stroke-width="1.7"
    />
    <!-- 音符比云细一档，否则在小尺寸下会和云的轮廓抢线重 -->
    <path d="M13.6 8.6v6.2" stroke-width="1.5" />
    <circle cx="11.8" cy="14.8" r="1.8" stroke-width="1.5" />
  </svg>
</template>

<style scoped>
.online-music-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>

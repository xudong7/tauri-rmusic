import { watch } from "vue";
import { useRoute } from "vue-router";
import { useViewStore } from "@/stores/viewStore";

/**
 * 切换页面时把播放队列收起来。
 *
 * 队列原先只有「点关闭」和「Escape」两种收法，切到设置等页面后它还挂在右侧，
 * 看起来像是所有页面共用的常驻栏。这里让它跟着路由走：换页即收起，并且不会
 * 自己放回来——想再看就重新点一次队列按钮，展不展开由用户当下的意图决定。
 */
export function usePlaybackQueueRouteReset() {
  const route = useRoute();
  const viewStore = useViewStore();

  // 盯 path 而不是 fullPath：同一个页面内换 query/hash 不算换页。
  //
  // 直接改 store，而不是调 App.vue 里那个同名包装——那个收完会把焦点还给队列
  // 按钮，可换页时用户的注意力在刚点的那条侧边栏链接上，把焦点抢走是帮倒忙。
  //
  // watcher 在调用方的 setup 里创建，随组件卸载自动停止。
  watch(
    () => route.path,
    () => viewStore.closePlaybackQueue()
  );
}

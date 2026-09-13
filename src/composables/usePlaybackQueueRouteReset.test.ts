import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { describe, expect, it } from "vitest";
import { usePlaybackQueueRouteReset } from "./usePlaybackQueueRouteReset";
import { useViewStore } from "@/stores/viewStore";

const Blank = defineComponent({ render: () => h("div") });

/** 最小宿主：useRoute 靠 inject 拿路由，所以必须真的把 router 装到测试 app 上。 */
function mountHarness() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "LocalMusic", component: Blank },
      { path: "/settings", name: "Settings", component: Blank },
    ],
  });
  const pinia = createPinia();

  const wrapper = mount(
    defineComponent({
      setup() {
        usePlaybackQueueRouteReset();
        return () => h("div");
      },
    }),
    { global: { plugins: [pinia, router] } }
  );

  return { wrapper, router, viewStore: useViewStore(pinia) };
}

/** 收起动作挂在 watcher 的 pre 队列上，要等它冲出来再断言 */
async function navigate(router: Router, path: string) {
  await router.push(path);
  await nextTick();
}

describe("usePlaybackQueueRouteReset", () => {
  it("换页时收起队列", async () => {
    const { router, viewStore } = mountHarness();
    viewStore.togglePlaybackQueue();
    expect(viewStore.showPlaybackQueue).toBe(true);

    await navigate(router, "/settings");

    expect(viewStore.showPlaybackQueue).toBe(false);
  });

  // 重新展开是用户的事：换回来不等于要自动放回去
  it("换回来也不会自动重新展开", async () => {
    const { router, viewStore } = mountHarness();
    await navigate(router, "/settings");
    viewStore.togglePlaybackQueue();

    await navigate(router, "/");

    expect(viewStore.showPlaybackQueue).toBe(false);
  });

  // 停在当前页面（点侧边栏里已经高亮的那一项）不是换页：路由没动，队列就不该关。
  // 这条同时钉住了「按 path 判断而不是无脑关」。
  it("停在当前页面时不收起", async () => {
    const { router, viewStore } = mountHarness();
    await navigate(router, "/settings");
    viewStore.togglePlaybackQueue();

    await navigate(router, "/settings");

    expect(viewStore.showPlaybackQueue).toBe(true);
  });
});

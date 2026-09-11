import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { QUEUE_ROW_HEIGHT, VIRTUAL_LIST_THRESHOLD } from "@/constants";
import PlaybackQueue from "./PlaybackQueue.vue";
import type { PlaybackQueueItem } from "@/types/model";

/** jsdom 里元素没有任何尺寸，虚拟列表会算出 0 行容量而渲染空列表。
 *  两个属性分属不同的原型，都要 stub：useElementSize 挂载时读
 *  HTMLElement.prototype.offsetHeight，计算可视容量时读的是
 *  Element.prototype.clientHeight。 */
const VIEWPORT_ROWS = 10;
const VIEWPORT_PX = QUEUE_ROW_HEIGHT * VIEWPORT_ROWS;

function stubViewportHeight() {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(VIEWPORT_PX);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(VIEWPORT_PX);
}

afterEach(() => {
  vi.restoreAllMocks();
});

function queue(count: number): PlaybackQueueItem[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `queue-${index}`,
    title: `Track ${index}`,
    artist: "Artist",
    sourceIndex: index,
    isCurrent: false,
  }));
}

/** 可视范围由 useVirtualList 的 watch 计算，是 pre-flush watcher，
 *  必须等到 nextTick 之后行才会出现在 DOM 里。 */
async function mountQueue(items: PlaybackQueueItem[]) {
  const wrapper = mount(PlaybackQueue, {
    props: { items, title: "", isPlaying: false },
    global: { plugins: [i18n] },
  });
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe("PlaybackQueue", () => {
  it("uses standard rendering for short queues", async () => {
    const wrapper = await mountQueue(queue(3));
    expect(wrapper.find("[data-render-mode='standard']").exists()).toBe(true);
    expect(wrapper.findAll(".queue-item")).toHaveLength(3);
  });

  it("switches to virtual rendering for long queues", async () => {
    const wrapper = await mountQueue(queue(VIRTUAL_LIST_THRESHOLD + 10));
    expect(wrapper.find("[data-render-mode='virtual']").exists()).toBe(true);
  });

  // 没有显式队列时 playbackQueueItems 会退化成整个本地曲库，所以渲染的
  // 节点数必须由可视区决定，而不是由队列长度决定。
  it("renders only the visible window for long queues", async () => {
    stubViewportHeight();
    const wrapper = await mountQueue(queue(2000));
    const rendered = wrapper.findAll(".queue-item").length;
    expect(rendered).toBeGreaterThan(0);
    // 可视 10 行 + 上下各 overscan 10 行，留出余量断言
    expect(rendered).toBeLessThanOrEqual(VIEWPORT_ROWS + 2 * 10);
  });

  it("shows the empty state when there is no queue", async () => {
    const wrapper = await mountQueue([]);
    expect(wrapper.find(".queue-empty").exists()).toBe(true);
    expect(wrapper.find(".queue-list").exists()).toBe(false);
  });
});

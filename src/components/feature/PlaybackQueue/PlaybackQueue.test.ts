import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { QUEUE_ROW_HEIGHT, VIRTUAL_LIST_THRESHOLD } from "@/constants";
import PlaybackQueue from "./PlaybackQueue.vue";
import type { PlaybackQueueItem } from "@/types/model";

// 队列要读本地封面，会用到 localMusicStore 取默认目录
vi.mock("@/stores/localMusicStore", () => ({
  useLocalMusicStore: () => ({ getDefaultDirectory: () => "/music" }),
}));

// 封面缓存换成 spy，好在外面看「到底给多少行排了加载」。
// vi.mock 的工厂会被提升到 import 之前，所以 spy 必须用 vi.hoisted 一起提。
const { scheduleCoverLoads } = vi.hoisted(() => ({ scheduleCoverLoads: vi.fn() }));
vi.mock("@/composables/useLocalCoverCache", () => ({
  useLocalCoverCache: () => ({ getCover: () => "", scheduleMany: scheduleCoverLoads }),
}));

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
async function mountQueue(items: PlaybackQueueItem[], title = "", isPlaying = false) {
  const wrapper = mount(PlaybackQueue, {
    props: { items, title, isPlaying },
    global: { plugins: [createPinia(), i18n] },
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

  // 两种渲染模式的行标记现在是同一份（QueueRow），这条钉住它没有退化：
  // 行数对、封面在、序号列已按参考图去掉。
  it("每行渲染封面，且不再有序号列", async () => {
    const wrapper = await mountQueue(queue(3));

    expect(wrapper.findAll(".queue-item-cover")).toHaveLength(3);
    expect(wrapper.findAll(".queue-item-index")).toHaveLength(0);
  });

  it("在线曲目直接用 pic_url，不排队异步加载", async () => {
    const wrapper = await mountQueue([
      {
        key: "online:1",
        title: "Track",
        artist: "Artist",
        sourceIndex: 0,
        isCurrent: false,
        coverUrl: "https://example.com/cover.jpg",
      },
    ]);

    expect(wrapper.get(".queue-item-cover img").attributes("src")).toBe(
      "https://example.com/cover.jpg"
    );
  });

  // 播放状态原先挂在序号列上，序号列取消后改挂封面叠层。
  // 表达必须与曲库列表逐字一致：播放中出跳动条，否则出带圈的 VideoPlay。
  it("当前曲目在封面叠层上显示播放状态", async () => {
    const playing = await mountQueue([{ ...queue(1)[0], isCurrent: true }], "", true);
    expect(playing.find(".queue-item-state .playing-bars").exists()).toBe(true);

    const paused = await mountQueue([{ ...queue(1)[0], isCurrent: true }]);
    expect(paused.find(".queue-item-state .playing-bars").exists()).toBe(false);
    // 带圈的路径里有半径 448 的圆弧，裸三角没有
    expect(paused.get(".queue-item-state path").attributes("d")).toContain("a448 448");

    const idle = await mountQueue([queue(1)[0]]);
    expect(idle.find(".queue-item-state").exists()).toBe(false);
  });

  // 面板现在是停靠式的：打开时主页列表照常可滚动可点击。宣称 aria-modal
  // 会让读屏把下面的内容当成惰性的，与实际行为正相反。
  it("面板不声明为模态", async () => {
    const panel = (await mountQueue(queue(3))).get(".queue-panel");

    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("aria-modal")).toBeUndefined();
  });

  it("Escape 关闭面板", async () => {
    const wrapper = await mountQueue(queue(3));

    await wrapper.get(".queue-panel").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("标题栏只显示队列来源，不再显示位置计数", async () => {
    const wrapper = await mountQueue(queue(26), "曲库");

    expect(wrapper.get(".queue-heading p").text()).toBe("曲库");
  });

  // 歌名与歌手现在同处一行，靠 .queue-item-main 的 flex 排布。
  // jsdom 量不到布局，只能钉住结构：两段必须是同一个容器的子元素，
  // 且歌手带自己的类名——分隔点挂在 .queue-item-artist 的 ::before 上。
  it("歌名与歌手排在同一个容器里", async () => {
    const main = (await mountQueue(queue(1))).get(".queue-item-main");
    const [title, artist] = Array.from(main.element.children);

    expect(main.element.children).toHaveLength(2);
    expect(title.tagName).toBe("STRONG");
    expect(artist.className).toContain("queue-item-artist");
  });

  // 本地封面要经 IPC 逐个取。没有显式队列时 queue 会退化成整个本地曲库，
  // 一旦给全量排加载，打开队列面板就会排上千次 IPC。这条盯住「只排可见行」。
  it("虚拟滚动时只给可视窗口内的行排封面加载", async () => {
    stubViewportHeight();
    scheduleCoverLoads.mockClear();
    const items = queue(2000).map((item, index) => ({
      ...item,
      coverFileName: `track-${index}.mp3`,
    }));

    await mountQueue(items);

    // 去重：可视窗口变化会让 watcher 多次触发，各次列表是重叠的，
    // 直接累加会把同一行算好几遍。
    const scheduled = new Set(
      scheduleCoverLoads.mock.calls.flatMap(([list]) =>
        (list as PlaybackQueueItem[]).map((item) => item.coverFileName)
      )
    );
    expect(scheduled.size).toBeGreaterThan(0);
    // 可视 10 行 + 上下各 overscan 10 行
    expect(scheduled.size).toBeLessThanOrEqual(VIEWPORT_ROWS + 2 * 10);
  });
});

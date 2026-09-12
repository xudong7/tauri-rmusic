import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TrackRow from "./TrackRow.vue";
import type { TrackRowModel } from "./types";

const item: TrackRowModel = {
  key: "track-1",
  title: "Track title",
  artist: "Artist",
  album: "Album",
  durationLabel: "3:20",
  coverUrl: "",
  source: "local",
  sourceIndex: 0,
  isCurrent: true,
  isPlaying: true,
};

describe("TrackRow", () => {
  // 专辑只出现在专辑那一列，不再重复写进歌手行。
  // 原先歌手行里还有一个 .track-row__meta-album，但它基线样式是 display: none、
  // 只在 1100px 以下才显形（作为收起专辑列时的补偿）。旧断言用 text() 抓
  // "Artist · Album"——text() 会把 display: none 的内容也算进去，所以它一直
  // 在为一个用户根本看不见的节点背书。专辑列现在常驻，那条补偿路径已删除。
  it("renders normalized track information", () => {
    const wrapper = mount(TrackRow, { props: { item } });

    expect(wrapper.text()).toContain("Track title");
    expect(wrapper.text()).toContain("3:20");
    expect(wrapper.classes()).toContain("is-current");

    expect(wrapper.get(".track-row__meta").text()).toBe("Artist");
    expect(wrapper.get(".track-row__album").text()).toBe("Album");
  });

  // 序号已全项目取消（队列面板先去掉，这里跟着对齐）。封面 + 歌名/歌手
  // 已经足够识别曲目，列头另有 x/y 交代位置，序号只剩视觉噪音。
  // 用 sourceIndex 非 0 的曲目，确保断的不是「碰巧没渲染」。
  it("不再渲染序号", () => {
    const wrapper = mount(TrackRow, {
      props: { item: { ...item, sourceIndex: 7, isCurrent: false, isPlaying: false } },
    });

    expect(wrapper.find(".track-row__index").exists()).toBe(false);
    expect(wrapper.find(".track-row__cover-play").text()).toBe("");
  });

  // 播放键原先是网格第一列的独立格子，把封面挤得不是行首。jsdom 量不到
  // 布局，只能把结构钉住：它必须是封面的后代，且封面上不再有别的格子。
  it("播放键叠在封面里，行首就是封面", () => {
    const wrapper = mount(TrackRow, { props: { item } });

    expect(wrapper.find(".track-row__cover .track-row__cover-play").exists()).toBe(true);
    expect(wrapper.find(".track-row__cover").element.children).toHaveLength(2);
  });

  // 操作按钮原先是网格最后一列，与歌名隔了专辑和时长两列
  it("操作按钮排在歌名这一列里", () => {
    const wrapper = mount(TrackRow, {
      props: { item },
      slots: { actions: '<button class="act">x</button>' },
    });

    expect(wrapper.find(".track-row__main .track-row__actions").exists()).toBe(true);
    expect(wrapper.find(".track-row__actions .act").exists()).toBe(true);
  });

  // 图标不能带那圈「边框」。Element Plus 的 VideoPlay 把三角套在圆圈里，
  // 而播放键本身往往已经是圆按钮或叠在封面上，多一圈就像多了个框。
  // 自绘的 PlayIcon 是纯三角：路径里没有任何圆弧命令（A/a），带圈的必有。
  it("播放键用无框三角，不带圆圈", () => {
    const wrapper = mount(TrackRow, {
      props: { item: { ...item, isCurrent: false, isPlaying: false } },
    });

    expect(wrapper.find(".track-row__play-icon .play-icon").exists()).toBe(true);
    const d = wrapper.get(".track-row__play-icon path").attributes("d") ?? "";
    expect(d).not.toMatch(/[aA]\s*\d/);
  });

  it("播放中出跳动条，否则出播放键", () => {
    const playing = mount(TrackRow, { props: { item } });
    expect(playing.find(".playing-bars").exists()).toBe(true);

    const paused = mount(TrackRow, { props: { item: { ...item, isPlaying: false } } });
    expect(paused.find(".playing-bars").exists()).toBe(false);
  });

  // 隔行底色按下标的奇偶来，参考图里第一行就是带底色的那一种
  it("按下标的奇偶决定隔行底色", () => {
    expect(mount(TrackRow, { props: { item, index: 0 } }).classes()).toContain(
      "is-striped"
    );
    expect(mount(TrackRow, { props: { item, index: 1 } }).classes()).not.toContain(
      "is-striped"
    );
  });

  it("emits activate from the play control", async () => {
    const wrapper = mount(TrackRow, { props: { item } });
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("activate")?.[0]).toEqual([item]);
  });

  it("uses selection behavior without activating playback", async () => {
    const wrapper = mount(TrackRow, {
      props: { item, selectionMode: true, selected: false },
    });
    await wrapper.find(".track-row").trigger("click");
    expect(wrapper.emitted("toggleSelect")?.[0]).toEqual([item]);
    expect(wrapper.emitted("activate")).toBeUndefined();
  });
});

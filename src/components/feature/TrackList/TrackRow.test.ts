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
  it("renders normalized track information", () => {
    const wrapper = mount(TrackRow, { props: { item } });
    expect(wrapper.text()).toContain("Track title");
    expect(wrapper.text()).toContain("Artist · Album");
    expect(wrapper.text()).toContain("3:20");
    expect(wrapper.classes()).toContain("is-current");
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

  // 播放键图标必须与队列面板、播放栏同族（VideoPlay，带圈），不能是裸三角。
  // 这里原先用 CaretRight，路径是 "M384 192v640l384-320z"，一个纯三角，
  // 和带圈的 VideoPlay 摆在同一屏里明显不是一套。
  // 带圈的路径里有半径 448 的圆弧，裸三角没有——以此区分。
  it("播放键用带圈的 VideoPlay，不是裸三角", () => {
    const wrapper = mount(TrackRow, {
      props: { item: { ...item, isCurrent: false, isPlaying: false } },
    });
    const d = wrapper.get(".track-row__play-icon path").attributes("d") ?? "";

    expect(d).toContain("a448 448");
  });

  it("播放中出跳动条，否则出播放键", () => {
    const playing = mount(TrackRow, { props: { item } });
    expect(playing.find(".playing-bars").exists()).toBe(true);

    const paused = mount(TrackRow, { props: { item: { ...item, isPlaying: false } } });
    expect(paused.find(".playing-bars").exists()).toBe(false);
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

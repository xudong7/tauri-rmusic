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
    expect(wrapper.find(".track-row__play").text()).toBe("");
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

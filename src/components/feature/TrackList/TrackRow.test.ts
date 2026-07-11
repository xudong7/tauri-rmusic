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

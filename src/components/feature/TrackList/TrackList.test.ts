import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TrackList from "./TrackList.vue";
import type { TrackRowModel } from "./types";

function rows(count: number): TrackRowModel[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `track-${index}`,
    title: `Track ${index}`,
    artist: "Artist",
    coverUrl: "",
    source: "local",
    sourceIndex: index,
    isCurrent: false,
    isPlaying: false,
  }));
}

describe("TrackList", () => {
  it("uses standard rendering for short lists", () => {
    const wrapper = mount(TrackList, { props: { items: rows(3) } });
    expect(wrapper.find("[data-render-mode='standard']").exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "TrackRow" })).toHaveLength(3);
  });

  it("switches to virtual rendering for long lists", () => {
    const wrapper = mount(TrackList, { props: { items: rows(60) } });
    expect(wrapper.find("[data-render-mode='virtual']").exists()).toBe(true);
  });
});

import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { SongInfo } from "@/types/model";
import LyricView from "./LyricView.vue";

const getSongLyricMock = vi.fn();

vi.mock("@/api/commands/netease", () => ({
  getSongLyric: (...args: unknown[]) => getSongLyricMock(...args),
}));

vi.mock("@/api/commands/file", () => ({
  loadLocalLyric: vi.fn().mockResolvedValue(""),
}));

function song(id: string): SongInfo {
  return {
    id,
    name: "Song",
    artists: ["Artist"],
    album: "Album",
    duration: 1000,
    pic_url: "",
    file_hash: `hash-${id}`,
  };
}

async function mountLyricView(id: string) {
  const wrapper = mount(LyricView, {
    props: {
      currentSong: song(id),
      currentMusic: null,
      isPlaying: false,
      currentTime: 0,
    },
    global: { plugins: [createPinia(), i18n] },
  });
  await flushPromises();
  return wrapper;
}

describe("LyricView 点击歌词跳转", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getSongLyricMock.mockReset().mockResolvedValue("[00:01.00]First\n[00:12.50]Second");
  });

  it("点击歌词行 emit 该行时间", async () => {
    const wrapper = await mountLyricView("jump");

    const lines = wrapper.findAll(".lyric-line.is-seekable");
    expect(lines).toHaveLength(2);

    await lines[1].trigger("click");
    expect(wrapper.emitted("seek")).toEqual([[12500]]);
  });

  it("暂无歌词的占位行不可点击", async () => {
    getSongLyricMock.mockResolvedValue("");
    const wrapper = await mountLyricView("empty");

    expect(wrapper.find(".lyric-line.is-seekable").exists()).toBe(false);
    await wrapper.get(".lyric-line").trigger("click");
    expect(wrapper.emitted("seek")).toBeUndefined();
  });
});

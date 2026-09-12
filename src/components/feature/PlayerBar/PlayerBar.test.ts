import { computed } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { PlayMode } from "@/types/model";
import PlayerBar from "./PlayerBar.vue";

vi.mock("@/composables/useCoverLoader", () => ({
  useCoverLoader: () => ({ coverUrl: computed(() => "/icon.png") }),
}));

vi.mock("@/composables/useArtistNavigation", () => ({
  useArtistNavigation: () => ({
    artistNames: computed(() => []),
    canNavigateArtist: computed(() => false),
    navigateArtistByName: vi.fn(),
  }),
}));

function mountBar(volume = 50): VueWrapper {
  return mount(PlayerBar, {
    props: {
      currentMusic: {
        id: 1,
        file_name: "Artist - Track.mp3",
        key: "track",
        relative_path: "Artist - Track.mp3",
        extension: "mp3",
        modified_ms: 1,
        search_text: "artist - track.mp3",
      },
      currentOnlineSong: null,
      isPlaying: false,
      playMode: PlayMode.SEQUENTIAL,
      volume,
      currentPlayTime: 1000,
      currentTrackDuration: 120000,
    },
    global: { plugins: [i18n] },
  });
}

/** 控制行各元素的类名，按 DOM 顺序 */
function controlClasses(wrapper: VueWrapper): string[] {
  return Array.from(wrapper.get(".player-controls").element.children).map(
    (child) => child.className
  );
}

describe("PlayerBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps progress and volume controls available with a current track", async () => {
    const wrapper = mountBar();

    expect(wrapper.find(".player-progress").exists()).toBe(true);
    expect(wrapper.find(".volume-control").exists()).toBe(true);
    await wrapper.find(".play-btn").trigger("click");
    expect(wrapper.emitted("toggle-play")).toHaveLength(1);
  });

  // 播放键要落在控制行正中，左右两侧就必须等宽：左边播放顺序，右边音量。
  // 这是纯几何约束，jsdom 量不到像素，只能把决定它的结构钉死。
  it("把播放顺序放在播放键左侧、音量放在右侧", () => {
    const classes = controlClasses(mountBar());

    expect(classes).toHaveLength(5);
    expect(classes[0]).toContain("play-mode-btn");
    expect(classes[classes.length - 1]).toContain("volume-control");
    // 中间三个仍是上一首 / 播放 / 下一首
    expect(classes[1]).toContain("control-btn");
    expect(classes[2]).toContain("play-btn");
    expect(classes[3]).toContain("control-btn");
  });

  // 浮层靠绝对定位脱离布局，音量键才能和播放顺序键一样只占 32px。
  // 一旦 popup 挪到 .volume-control 外面，它的包含块会变成 .player-bar，
  // 定位就会跑到整条播放栏顶部而不是图标正上方。
  it("音量滑块藏在浮层里，不参与控制行布局", () => {
    const wrapper = mountBar();

    expect(wrapper.find(".volume-control .volume-popup").exists()).toBe(true);
    expect(wrapper.find(".volume-popup .volume-slider").exists()).toBe(true);
    expect(controlClasses(wrapper).some((name) => name.includes("volume-popup"))).toBe(
      false
    );
  });

  it("把播放队列单独留在右侧", () => {
    const wrapper = mountBar();

    expect(wrapper.find(".player-right .queue-btn").exists()).toBe(true);
    expect(wrapper.findAll(".player-right > *")).toHaveLength(1);
  });

  it("点音量图标静音，滑块随之归零", async () => {
    const wrapper = mountBar(70);

    await wrapper.get(".volume-speaker-icon").trigger("click");

    expect(wrapper.emitted("volume-change")?.[0]).toEqual([0]);
  });
});

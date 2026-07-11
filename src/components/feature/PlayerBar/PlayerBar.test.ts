import { computed } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
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

describe("PlayerBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps progress and volume controls available with a current track", async () => {
    const wrapper = mount(PlayerBar, {
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
        volume: 50,
        currentPlayTime: 1000,
        currentTrackDuration: 120000,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find(".player-progress").exists()).toBe(true);
    expect(wrapper.find(".volume-bar").exists()).toBe(true);
    await wrapper.find(".play-btn").trigger("click");
    expect(wrapper.emitted("toggle-play")).toHaveLength(1);
  });
});

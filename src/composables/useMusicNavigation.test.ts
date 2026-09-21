import { defineComponent } from "vue";
import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { SongInfo } from "@/types/model";
import { resolveAlbumByName } from "@/utils/albumNav";
import { resolveArtistByName } from "@/utils/artistNav";
import { useAlbumNavigation } from "./useAlbumNavigation";
import { useArtistNavigation } from "./useArtistNavigation";

// 跳转前会先确保在线服务（ensureStarted 内部还会探活），命令都换成桩。
vi.mock("@/api/commands/netease", () => ({
  ensureOnlineService: vi.fn().mockResolvedValue(undefined),
  checkOnlineServiceStatus: vi
    .fn()
    .mockResolvedValue({ available: true, status_code: 200, message: "" }),
}));

vi.mock("@/utils/albumNav", () => ({ resolveAlbumByName: vi.fn() }));
vi.mock("@/utils/artistNav", () => ({ resolveArtistByName: vi.fn() }));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: { template: "<div />" } },
    {
      path: "/online/album/:id",
      name: "OnlineAlbum",
      component: { template: "<div />" },
    },
    { path: "/artist/:id", name: "Artist", component: { template: "<div />" } },
  ],
});

const onlineSong: SongInfo = {
  id: "s1",
  name: "TOKYO-KICK-ASS",
  artists: ["Daoko"],
  album: "TOKYO-KICK-ASS",
  duration: 1000,
  pic_url: "",
  file_hash: "h1",
  album_id: "al-9",
  artist_ids: ["ar-7"],
};

/** 组合式函数里的 useRouter 需要组件上下文，用挂载的壳来调用 */
function setup(song: SongInfo | null, localAlbum = "", localArtist = "") {
  const result: {
    albumNav?: ReturnType<typeof useAlbumNavigation>;
    artistNav?: ReturnType<typeof useArtistNavigation>;
  } = {};
  mount(
    defineComponent({
      setup() {
        result.albumNav = useAlbumNavigation({
          currentOnlineSong: () => song,
          localAlbumDisplay: () => localAlbum,
          localArtistDisplay: () => localArtist,
          displayTitle: () => song?.name ?? localAlbum,
          onlineAlbums: () => [],
        });
        result.artistNav = useArtistNavigation({
          currentOnlineSong: () => song,
          localArtistDisplay: () => localArtist,
          currentArtist: () => null,
          onlineArtists: () => [],
        });
        return () => null;
      },
    }),
    { global: { plugins: [createPinia(), i18n, router] } }
  );
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("歌名/歌手跳转", () => {
  // 按名字搜索经常落到翻唱、合辑（只有几首曲子），在线歌曲自带 id 就该直接用
  it("在线歌曲直接用专辑 id 打开专辑页，不做名字搜索", async () => {
    const { albumNav } = setup(onlineSong);

    const navigated = await albumNav!.navigateAlbumByName();

    expect(navigated).toBe(true);
    expect(router.currentRoute.value.name).toBe("OnlineAlbum");
    expect(router.currentRoute.value.params.id).toBe("al-9");
    expect(resolveAlbumByName).not.toHaveBeenCalled();
  });

  it("在线歌曲直接用歌手 id 打开歌手页", async () => {
    const { artistNav } = setup(onlineSong);

    const navigated = await artistNav!.navigateArtistByName("Daoko");

    expect(navigated).toBe(true);
    expect(router.currentRoute.value.name).toBe("Artist");
    expect(router.currentRoute.value.params.id).toBe("ar-7");
    expect(resolveArtistByName).not.toHaveBeenCalled();
  });

  it("本地文件没有 id，仍走名字搜索", async () => {
    vi.mocked(resolveAlbumByName).mockResolvedValue({
      id: "al-search",
      name: "Album",
      pic_url: "",
      size: 1,
      artist: "Artist",
      publish_time: 0,
      company: "",
    });
    const { albumNav } = setup(null, "Album", "Artist");

    const navigated = await albumNav!.navigateAlbumByName();

    expect(navigated).toBe(true);
    expect(router.currentRoute.value.params.id).toBe("al-search");
    expect(resolveAlbumByName).toHaveBeenCalled();
  });

  it("在线歌曲的 id 对不上歌手名时回退到搜索", async () => {
    vi.mocked(resolveArtistByName).mockResolvedValue({
      id: "ar-search",
      name: "Someone",
      pic_url: "",
    });
    const { artistNav } = setup(onlineSong);

    const navigated = await artistNav!.navigateArtistByName("Someone Else");

    expect(navigated).toBe(true);
    expect(router.currentRoute.value.params.id).toBe("ar-search");
    expect(resolveArtistByName).toHaveBeenCalled();
  });
});

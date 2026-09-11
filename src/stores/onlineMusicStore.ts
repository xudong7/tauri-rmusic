import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type {
  AlbumInfo,
  ArtistInfo,
  OnlineSearchTab,
  OnlineTab,
  PlaylistInfo,
  SongInfo,
} from "@/types/model";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "@/utils/errorUtils";
import { MAX_GRID_ITEMS } from "@/constants";
import {
  searchOnlineAlbums,
  searchOnlineArtists,
  searchOnlineMix,
  searchOnlinePlaylists,
} from "@/api/commands/netease";

/** 各 tab 的每页条数。单曲沿用原有的 20 条节奏，网格每页多给一些。 */
const SONG_PAGE_SIZE = 20;
const GRID_SEARCH_PAGE_SIZE = 30;
/** 单曲 tab 顶部歌手条的条数 */
const ARTIST_STRIP_LIMIT = 6;

interface TabMeta {
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  /** 该 tab 已加载的关键词。空串表示尚未加载过任何关键词。 */
  loadedKeyword: string;
}

function createTabMeta(): TabMeta {
  return { page: 1, total: 0, hasMore: false, loading: false, loadedKeyword: "" };
}

export const useOnlineMusicStore = defineStore("onlineMusic", () => {
  const activeTab = ref<OnlineTab>("song");
  const searchKeyword = ref("");

  // 单曲 tab
  const onlineSongs = ref<SongInfo[]>([]);
  const onlineSongsTotal = ref(0);
  /**
   * 单曲搜索顺带取回的歌手候选。界面上已不再展示（歌手有自己的 tab），
   * 这里保留是为了喂给 PlayerBar / ImmersiveView 的「点击歌手名跳转」——
   * 见 useArtistNavigation / resolveArtistByName，它优先从这份缓存里按名字
   * 命中歌手 id，命中不了才发请求。
   *
   * 代价为零：search_online_mix 用 tokio::join! 并发取歌曲与歌手，
   * 并不增加等待时间。删掉它会让播放栏的歌手跳转每次都多一次往返。
   */
  const onlineArtists = ref<ArtistInfo[]>([]);

  // 歌手 tab
  const artistResults = ref<ArtistInfo[]>([]);

  // 专辑 tab
  const albumResults = ref<AlbumInfo[]>([]);

  // 歌单 tab
  const playlistResults = ref<PlaylistInfo[]>([]);

  const tabMeta = ref<Record<OnlineSearchTab, TabMeta>>({
    song: createTabMeta(),
    artist: createTabMeta(),
    album: createTabMeta(),
    playlist: createTabMeta(),
  });

  // 竞态守卫按 tab 独立。用普通对象而非 ref：仅用于比较，不需要参与渲染。
  const requestIds: Record<OnlineSearchTab, number> = {
    song: 0,
    artist: 0,
    album: 0,
    playlist: 0,
  };

  function reportSearchError(error: unknown) {
    console.error("在线搜索失败:", error);
    ElMessage.error(
      `${i18n.global.t("errors.searchFailed")}: ${parseErrorMessage(error)}`
    );
  }

  /** 网格类 tab 达到软上限后不再翻页，由视图提示用户细化搜索。 */
  function gridHasMore(loaded: number, total: number): boolean {
    return loaded < total && loaded < MAX_GRID_ITEMS;
  }

  async function searchSongs(keyword: string, page: number) {
    const requestId = ++requestIds.song;
    const meta = tabMeta.value.song;
    meta.loading = true;
    try {
      const result = await searchOnlineMix({
        keywords: keyword,
        page,
        pagesize: SONG_PAGE_SIZE,
        artistLimit: ARTIST_STRIP_LIMIT,
      });
      if (requestId !== requestIds.song) return;

      if (page === 1) {
        onlineSongs.value = result.songs;
        onlineArtists.value = result.artists ?? [];
      } else {
        onlineSongs.value.push(...result.songs);
      }
      onlineSongsTotal.value = result.total;
      meta.total = result.total;
      meta.page = page;
      meta.hasMore = onlineSongs.value.length < result.total;
      meta.loadedKeyword = keyword;

      if (
        page === 1 &&
        result.songs.length === 0 &&
        (result.artists?.length ?? 0) === 0
      ) {
        ElMessage.info(i18n.global.t("messages.noSearchResult"));
      }
    } catch (error) {
      if (requestId !== requestIds.song) return;
      reportSearchError(error);
    } finally {
      if (requestId === requestIds.song) meta.loading = false;
    }
  }

  async function searchArtists(keyword: string, page: number) {
    const requestId = ++requestIds.artist;
    const meta = tabMeta.value.artist;
    meta.loading = true;
    try {
      const result = await searchOnlineArtists({
        keywords: keyword,
        page,
        pagesize: GRID_SEARCH_PAGE_SIZE,
      });
      if (requestId !== requestIds.artist) return;

      if (page === 1) artistResults.value = result.artists;
      else artistResults.value.push(...result.artists);

      meta.total = result.total;
      meta.page = page;
      meta.hasMore = gridHasMore(artistResults.value.length, result.total);
      meta.loadedKeyword = keyword;

      if (page === 1 && result.artists.length === 0) {
        ElMessage.info(i18n.global.t("messages.noSearchResult"));
      }
    } catch (error) {
      if (requestId !== requestIds.artist) return;
      reportSearchError(error);
    } finally {
      if (requestId === requestIds.artist) meta.loading = false;
    }
  }

  async function searchAlbums(keyword: string, page: number) {
    const requestId = ++requestIds.album;
    const meta = tabMeta.value.album;
    meta.loading = true;
    try {
      const result = await searchOnlineAlbums({
        keywords: keyword,
        page,
        pagesize: GRID_SEARCH_PAGE_SIZE,
      });
      if (requestId !== requestIds.album) return;

      if (page === 1) albumResults.value = result.albums;
      else albumResults.value.push(...result.albums);

      meta.total = result.total;
      meta.page = page;
      meta.hasMore = gridHasMore(albumResults.value.length, result.total);
      meta.loadedKeyword = keyword;

      if (page === 1 && result.albums.length === 0) {
        ElMessage.info(i18n.global.t("messages.noSearchResult"));
      }
    } catch (error) {
      if (requestId !== requestIds.album) return;
      reportSearchError(error);
    } finally {
      if (requestId === requestIds.album) meta.loading = false;
    }
  }

  async function searchPlaylists(keyword: string, page: number) {
    const requestId = ++requestIds.playlist;
    const meta = tabMeta.value.playlist;
    meta.loading = true;
    try {
      const result = await searchOnlinePlaylists({
        keywords: keyword,
        page,
        pagesize: GRID_SEARCH_PAGE_SIZE,
      });
      if (requestId !== requestIds.playlist) return;

      if (page === 1) playlistResults.value = result.playlists;
      else playlistResults.value.push(...result.playlists);

      meta.total = result.total;
      meta.page = page;
      meta.hasMore = gridHasMore(playlistResults.value.length, result.total);
      meta.loadedKeyword = keyword;

      if (page === 1 && result.playlists.length === 0) {
        ElMessage.info(i18n.global.t("messages.noSearchResult"));
      }
    } catch (error) {
      if (requestId !== requestIds.playlist) return;
      reportSearchError(error);
    } finally {
      if (requestId === requestIds.playlist) meta.loading = false;
    }
  }

  function searchTab(tab: OnlineSearchTab, keyword: string, page: number) {
    if (tab === "artist") return searchArtists(keyword, page);
    if (tab === "album") return searchAlbums(keyword, page);
    if (tab === "playlist") return searchPlaylists(keyword, page);
    return searchSongs(keyword, page);
  }

  /** 搜索框的唯一入口：只打当前 tab 的端点，不四处扇出。 */
  async function searchActiveTab(keyword: string) {
    // 排行榜不是搜索结果；从该页签发起搜索时切回单曲
    if (activeTab.value === "toplist") activeTab.value = "song";
    searchKeyword.value = keyword;
    await searchTab(activeTab.value as OnlineSearchTab, keyword, 1);
  }

  /** 切换 tab：仅当该 tab 尚未加载当前关键词时才发请求。 */
  function setTab(tab: OnlineTab) {
    activeTab.value = tab;
    // 榜单的数据由视图自行加载（它在另一个 store 里）
    if (tab === "toplist") return;
    const meta = tabMeta.value[tab];
    if (searchKeyword.value && meta.loadedKeyword !== searchKeyword.value) {
      void searchTab(tab, searchKeyword.value, 1);
    }
  }

  function loadMoreActiveTab() {
    if (activeTab.value === "toplist") return;
    const tab = activeTab.value as OnlineSearchTab;
    const meta = tabMeta.value[tab];
    if (meta.loading || !meta.hasMore) return;
    void searchTab(tab, meta.loadedKeyword || searchKeyword.value, meta.page + 1);
  }

  function resetResults() {
    onlineSongs.value = [];
    onlineSongsTotal.value = 0;
    onlineArtists.value = [];
    artistResults.value = [];
    albumResults.value = [];
    playlistResults.value = [];
    searchKeyword.value = "";

    for (const tab of Object.keys(tabMeta.value) as OnlineSearchTab[]) {
      tabMeta.value[tab] = createTabMeta();
      // 递增使所有在途请求立即作废
      requestIds[tab] += 1;
    }
  }

  return {
    activeTab,
    searchKeyword,
    onlineSongs,
    onlineSongsTotal,
    onlineArtists,
    artistResults,
    albumResults,
    playlistResults,
    tabMeta,
    searchActiveTab,
    setTab,
    loadMoreActiveTab,
    resetResults,
  };
});

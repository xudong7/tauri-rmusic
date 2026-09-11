import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type {
  AlbumInfo,
  ArtistInfo,
  OnlineSearchTab,
  PlaylistInfo,
  SongInfo,
} from "@/types/model";
import { i18n } from "@/i18n";
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
  const activeTab = ref<OnlineSearchTab>("song");
  const searchKeyword = ref("");

  // 单曲 tab
  const onlineSongs = ref<SongInfo[]>([]);
  const onlineSongsTotal = ref(0);
  /**
   * 歌手条。除单曲搜索结果外，PlayerBar 与 ImmersiveView 也依赖它做
   * 「点击正在播放歌曲的歌手名」的快速跳转（见 useArtistNavigation），
   * 因此单曲 tab 必须继续填充它。
   */
  const onlineArtists = ref<ArtistInfo[]>([]);

  // 歌手 tab
  const artistResults = ref<ArtistInfo[]>([]);
  const artistResultsTotal = ref(0);

  // 专辑 tab
  const albumResults = ref<AlbumInfo[]>([]);
  const albumResultsTotal = ref(0);

  // 歌单 tab
  const playlistResults = ref<PlaylistInfo[]>([]);
  const playlistResultsTotal = ref(0);

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

  const isSearchLoading = computed(() => tabMeta.value[activeTab.value].loading);
  const activeTabTotal = computed(() => tabMeta.value[activeTab.value].total);
  const activeTabHasMore = computed(() => tabMeta.value[activeTab.value].hasMore);

  function reportSearchError(error: unknown) {
    console.error("在线搜索失败:", error);
    ElMessage.error(`${i18n.global.t("errors.searchFailed")}: ${error}`);
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

      artistResultsTotal.value = result.total;
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

      albumResultsTotal.value = result.total;
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

      playlistResultsTotal.value = result.total;
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
    searchKeyword.value = keyword;
    await searchTab(activeTab.value, keyword, 1);
  }

  /** 切换 tab：仅当该 tab 尚未加载当前关键词时才发请求。 */
  function setTab(tab: OnlineSearchTab) {
    activeTab.value = tab;
    const meta = tabMeta.value[tab];
    if (searchKeyword.value && meta.loadedKeyword !== searchKeyword.value) {
      void searchTab(tab, searchKeyword.value, 1);
    }
  }

  function loadMoreActiveTab() {
    const tab = activeTab.value;
    const meta = tabMeta.value[tab];
    if (meta.loading || !meta.hasMore) return;
    void searchTab(tab, meta.loadedKeyword || searchKeyword.value, meta.page + 1);
  }

  function resetResults() {
    onlineSongs.value = [];
    onlineSongsTotal.value = 0;
    onlineArtists.value = [];
    artistResults.value = [];
    artistResultsTotal.value = 0;
    albumResults.value = [];
    albumResultsTotal.value = 0;
    playlistResults.value = [];
    playlistResultsTotal.value = 0;
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
    artistResultsTotal,
    albumResults,
    albumResultsTotal,
    playlistResults,
    playlistResultsTotal,
    tabMeta,
    isSearchLoading,
    activeTabTotal,
    activeTabHasMore,
    searchActiveTab,
    setTab,
    loadMoreActiveTab,
    resetResults,
  };
});

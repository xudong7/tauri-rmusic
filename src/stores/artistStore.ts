import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { AlbumInfo, ArtistInfo, SongInfo } from "@/types/model";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "@/utils/errorUtils";
import {
  getArtistAlbums,
  getArtistDetail,
  getArtistSongs,
  getArtistTopSongs,
} from "@/api/commands/netease";

const ARTIST_SONGS_PAGE_SIZE = 50;
const ARTIST_ALBUMS_PAGE_SIZE = 30;

/** 后端在拿不到歌手名时会返回这个占位值，视为「无名字」。 */
const PLACEHOLDER_ARTIST_NAME = "Artist";

export const useArtistStore = defineStore("artist", () => {
  const artistSongs = ref<SongInfo[]>([]);
  const artistSongsTotal = ref(0);
  const artistSongsHasMore = ref(false);
  const currentArtist = ref<ArtistInfo | null>(null);
  const artistAlbumCount = ref(0);
  const artistMusicCount = ref(0);
  const isArtistLoading = ref(false);

  const artistAlbums = ref<AlbumInfo[]>([]);
  const artistAlbumsHasMore = ref(false);
  const isAlbumsLoading = ref(false);

  let songsRequestId = 0;
  let detailRequestId = 0;
  let albumsRequestId = 0;
  /**
   * 当前正在浏览的歌手 id。
   *
   * 刻意不从这里改为从 currentArtist 推导：loadArtistDetail 是异步的，
   * 在它返回之前 currentArtist 可能还是上一个歌手（或只有路由 query 的
   * 占位值），此时翻页会取到错误的 id 或静默失效。
   */
  let loadedArtistId = "";

  /**
   * 合并歌手信息：保留占位名处理。
   * 路由 query 会先塞入一份用于即时渲染，所以这里的策略是
   * 「后端给了真名字才覆盖，否则沿用已有的」。
   */
  function mergeArtist(incoming: ArtistInfo | null, fallbackId: string) {
    if (!incoming) return;
    const prev = currentArtist.value;
    const incomingName =
      incoming.name && incoming.name !== PLACEHOLDER_ARTIST_NAME ? incoming.name : "";
    const merged: ArtistInfo = {
      id: incoming.id || prev?.id || fallbackId,
      name: incomingName || prev?.name || PLACEHOLDER_ARTIST_NAME,
      pic_url: incoming.pic_url || prev?.pic_url || "",
    };
    currentArtist.value = merged;
  }

  async function loadArtistDetail(artistId: string) {
    const requestId = ++detailRequestId;
    try {
      const res = await getArtistDetail({ id: artistId });
      if (requestId !== detailRequestId) return;
      mergeArtist(res.artist, artistId);
      artistAlbumCount.value = res.album_count;
      artistMusicCount.value = res.music_count;
    } catch (error) {
      // 作品数拿不到不应影响歌曲列表，静默降级
      if (requestId !== detailRequestId) return;
      console.error("加载歌手信息失败:", error);
    }
  }

  /**
   * 加载歌手歌曲。
   *
   * 主路径走 /artist/songs（支持任意 offset 翻页与 hot/time 排序）；
   * 首屏若返回空或失败，回退到 /artist/top/song 的既有路径并停止翻页，
   * 保证最差情况下不比改动前更差。
   */
  async function loadArtistSongs(artistId: string, page = 1) {
    const requestId = ++songsRequestId;
    try {
      if (page === 1) {
        loadedArtistId = artistId;
        artistSongs.value = [];
        artistSongsTotal.value = 0;
        artistSongsHasMore.value = false;
      }
      isArtistLoading.value = true;

      let songs: SongInfo[] = [];
      let total = 0;
      let hasMore = false;

      try {
        const res = await getArtistSongs({
          id: artistId,
          page,
          pagesize: ARTIST_SONGS_PAGE_SIZE,
          order: "hot",
        });
        if (requestId !== songsRequestId) return;
        songs = res.songs ?? [];
        total = res.total ?? 0;
        hasMore = res.has_more;
      } catch (error) {
        if (requestId !== songsRequestId) return;
        if (page > 1) throw error;
        console.error("/artist/songs 不可用，回退到热门歌曲:", error);
      }

      // 首屏回退：/artist/songs 不可用时改用 /artist/top/song
      if (page === 1 && songs.length === 0) {
        const fallback = await getArtistTopSongs({
          id: artistId,
          limit: ARTIST_SONGS_PAGE_SIZE,
        });
        if (requestId !== songsRequestId) return;
        mergeArtist(fallback.artist, artistId);
        songs = fallback.songs ?? [];
        total = fallback.total ?? songs.length;
        // 该接口只有固定 50 首，无从翻页
        hasMore = false;
      }

      if (page === 1) {
        artistSongs.value = songs;
      } else {
        artistSongs.value.push(...songs);
      }
      artistSongsTotal.value = total;
      artistSongsHasMore.value = hasMore;
    } catch (error) {
      if (requestId !== songsRequestId) return;
      console.error("加载歌手歌曲失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.searchFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === songsRequestId) isArtistLoading.value = false;
    }
  }

  async function loadMoreArtistSongs() {
    if (!loadedArtistId || isArtistLoading.value || !artistSongsHasMore.value) return;
    const nextPage = Math.ceil(artistSongs.value.length / ARTIST_SONGS_PAGE_SIZE) + 1;
    await loadArtistSongs(loadedArtistId, nextPage);
  }

  async function loadArtistAlbums(artistId: string, page = 1) {
    const requestId = ++albumsRequestId;
    try {
      if (page === 1) {
        artistAlbums.value = [];
        artistAlbumsHasMore.value = false;
      }
      isAlbumsLoading.value = true;
      const res = await getArtistAlbums({
        id: artistId,
        page,
        pagesize: ARTIST_ALBUMS_PAGE_SIZE,
      });
      if (requestId !== albumsRequestId) return;

      if (page === 1) artistAlbums.value = res.albums ?? [];
      else artistAlbums.value.push(...res.albums);
      artistAlbumsHasMore.value = res.has_more;
    } catch (error) {
      if (requestId !== albumsRequestId) return;
      console.error("加载歌手专辑失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadArtistAlbumsFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === albumsRequestId) isAlbumsLoading.value = false;
    }
  }

  async function loadMoreArtistAlbums() {
    if (!loadedArtistId || isAlbumsLoading.value || !artistAlbumsHasMore.value) return;
    const nextPage = Math.ceil(artistAlbums.value.length / ARTIST_ALBUMS_PAGE_SIZE) + 1;
    await loadArtistAlbums(loadedArtistId, nextPage);
  }

  /** 进入歌手页的统一入口：三份数据互不阻塞，各自独立失败。 */
  function loadArtist(artistId: string) {
    void loadArtistDetail(artistId);
    void loadArtistSongs(artistId, 1);
    void loadArtistAlbums(artistId, 1);
  }

  return {
    artistSongs,
    artistSongsTotal,
    artistSongsHasMore,
    currentArtist,
    artistAlbumCount,
    artistMusicCount,
    isArtistLoading,
    artistAlbums,
    artistAlbumsHasMore,
    isAlbumsLoading,
    loadArtist,
    loadArtistSongs,
    loadMoreArtistSongs,
    loadArtistAlbums,
    loadMoreArtistAlbums,
  };
});

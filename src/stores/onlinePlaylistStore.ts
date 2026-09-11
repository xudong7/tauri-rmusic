import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { PlaylistInfo, SongInfo } from "@/types/model";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "@/utils/errorUtils";
import { PLAYLIST_TRACKS_PAGE_SIZE } from "@/constants";
import { getPlaylistDetail, getPlaylistTracks, getToplist } from "@/api/commands/netease";

/**
 * 在线歌单与排行榜。
 *
 * 两者共用一个 store：/toplist 返回的实体与歌单同构（榜单本质就是特殊歌单），
 * 详情页也直接复用歌单详情，放在一起比拆成两个 store 更自然。
 *
 * 元数据与曲目分页各有独立的竞态守卫——两者可能因不同原因被触发，
 * 共用一个 id 会互相作废。
 */
export const useOnlinePlaylistStore = defineStore("onlinePlaylist", () => {
  /* ---------- 排行榜 ---------- */
  const toplists = ref<PlaylistInfo[]>([]);
  const isToplistLoading = ref(false);
  let toplistRequestId = 0;

  async function loadToplist() {
    const requestId = ++toplistRequestId;
    try {
      isToplistLoading.value = true;
      const result = await getToplist();
      if (requestId !== toplistRequestId) return;
      toplists.value = result.toplists;
    } catch (error) {
      if (requestId !== toplistRequestId) return;
      console.error("加载排行榜失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadToplistFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === toplistRequestId) isToplistLoading.value = false;
    }
  }

  /* ---------- 歌单详情 ---------- */
  const detail = ref<PlaylistInfo | null>(null);
  const songs = ref<SongInfo[]>([]);
  const hasMoreTracks = ref(false);
  const isDetailLoading = ref(false);
  const isLoadingMoreTracks = ref(false);
  let detailRequestId = 0;
  let tracksRequestId = 0;

  async function loadDetail(id: string) {
    const requestId = ++detailRequestId;
    // 切换歌单时立即清空，避免旧曲目与新歌单头并存
    songs.value = [];
    hasMoreTracks.value = false;
    try {
      isDetailLoading.value = true;
      const result = await getPlaylistDetail({ id });
      if (requestId !== detailRequestId) return;

      detail.value = result.playlist;
      // 元数据到位后才能拿到 trackCount，据此拉首页曲目
      await loadFirstTracks(id, result.playlist.track_count, requestId);
    } catch (error) {
      if (requestId !== detailRequestId) return;
      detail.value = null;
      console.error("加载歌单失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadPlaylistFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === detailRequestId) isDetailLoading.value = false;
    }
  }

  async function loadFirstTracks(id: string, trackCount: number, detailId: number) {
    const requestId = ++tracksRequestId;
    const result = await getPlaylistTracks({
      id,
      offset: 0,
      limit: PLAYLIST_TRACKS_PAGE_SIZE,
      trackCount,
    });
    // 歌单可能在等待期间已切换
    if (requestId !== tracksRequestId || detailId !== detailRequestId) return;
    songs.value = result.songs;
    hasMoreTracks.value = result.has_more;
  }

  async function loadMoreTracks() {
    const current = detail.value;
    if (!current || isLoadingMoreTracks.value || !hasMoreTracks.value) return;

    const requestId = ++tracksRequestId;
    try {
      isLoadingMoreTracks.value = true;
      const result = await getPlaylistTracks({
        id: current.id,
        offset: songs.value.length,
        limit: PLAYLIST_TRACKS_PAGE_SIZE,
        trackCount: current.track_count,
      });
      if (requestId !== tracksRequestId) return;

      songs.value.push(...result.songs);
      hasMoreTracks.value = result.has_more;
    } catch (error) {
      if (requestId !== tracksRequestId) return;
      console.error("加载歌单曲目失败:", error);
      ElMessage.error(
        `${i18n.global.t("errors.loadPlaylistFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (requestId === tracksRequestId) isLoadingMoreTracks.value = false;
    }
  }

  function resetDetail() {
    detail.value = null;
    songs.value = [];
    hasMoreTracks.value = false;
    isDetailLoading.value = false;
    isLoadingMoreTracks.value = false;
    detailRequestId++;
    tracksRequestId++;
  }

  return {
    toplists,
    isToplistLoading,
    loadToplist,
    detail,
    songs,
    hasMoreTracks,
    isDetailLoading,
    isLoadingMoreTracks,
    loadDetail,
    loadMoreTracks,
    resetDetail,
  };
});

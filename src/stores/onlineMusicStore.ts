import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { i18n } from "@/i18n";
import { searchOnlineMix } from "@/api/commands/netease";

export const useOnlineMusicStore = defineStore("onlineMusic", () => {
  const onlineSongs = ref<SongInfo[]>([]);
  const onlineSongsTotal = ref(0);
  const onlineArtists = ref<ArtistInfo[]>([]);
  const isSearchLoading = ref(false);
  const searchKeyword = ref("");
  const currentPage = ref(1);
  const pageSize = ref(20);

  async function searchOnlineMusic(keyword: string, page = 1) {
    try {
      if (page === 1) {
        onlineSongs.value = [];
        onlineSongsTotal.value = 0;
        onlineArtists.value = [];
      }

      searchKeyword.value = keyword;
      currentPage.value = page;
      isSearchLoading.value = true;

      const result = await searchOnlineMix({
        keywords: keyword,
        page,
        pagesize: pageSize.value,
        artistLimit: 6,
      });

      if (page === 1) {
        onlineSongs.value = result.songs;
        onlineArtists.value = result.artists ?? [];
      } else {
        onlineSongs.value = [...onlineSongs.value, ...result.songs];
      }

      onlineSongsTotal.value = result.total;

      if (result.songs.length === 0 && page === 1) {
        ElMessage.info(i18n.global.t("messages.noSearchResult"));
      }
    } catch (error) {
      console.error("在线搜索失败:", error);
      ElMessage.error(`${i18n.global.t("errors.searchFailed")}: ${error}`);
    } finally {
      isSearchLoading.value = false;
    }
  }

  function loadMoreResults() {
    if (!searchKeyword.value || isSearchLoading.value) return;
    if (onlineSongs.value.length >= onlineSongsTotal.value) return;
    void searchOnlineMusic(searchKeyword.value, currentPage.value + 1);
  }

  function resetResults() {
    onlineSongs.value = [];
    onlineSongsTotal.value = 0;
    onlineArtists.value = [];
    isSearchLoading.value = false;
    searchKeyword.value = "";
    currentPage.value = 1;
  }

  return {
    onlineSongs,
    onlineSongsTotal,
    onlineArtists,
    isSearchLoading,
    searchKeyword,
    currentPage,
    pageSize,
    searchOnlineMusic,
    loadMoreResults,
    resetResults,
  };
});

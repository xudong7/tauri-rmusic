import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { i18n } from "@/i18n";
import { getArtistTopSongs } from "@/api/commands/netease";

export const useArtistStore = defineStore("artist", () => {
  const artistSongs = ref<SongInfo[]>([]);
  const artistSongsTotal = ref(0);
  const currentArtist = ref<ArtistInfo | null>(null);
  const isArtistLoading = ref(false);
  const artistPage = ref(1);
  const artistPageSize = ref(50);

  async function loadArtistSongs(artistId: string, page = 1) {
    try {
      if (page === 1) {
        artistSongs.value = [];
        artistSongsTotal.value = 0;
        artistPage.value = 1;
      }
      isArtistLoading.value = true;
      const res = await getArtistTopSongs({
        id: artistId,
        limit: artistPageSize.value,
      });

      if (res.artist) {
        const prev = currentArtist.value;
        const incomingName =
          res.artist.name && res.artist.name !== "Artist" ? res.artist.name : "";
        currentArtist.value = {
          id: res.artist.id || prev?.id || artistId,
          name: incomingName || prev?.name || "Artist",
          pic_url: res.artist.pic_url || prev?.pic_url || "",
        };
      } else {
        currentArtist.value = currentArtist.value ?? null;
      }

      artistSongs.value = res.songs ?? [];
      artistSongsTotal.value = res.total ?? res.songs?.length ?? 0;
      artistPage.value = page;
    } catch (error) {
      console.error("加载歌手歌曲失败:", error);
      ElMessage.error(`${i18n.global.t("errors.searchFailed")}: ${error}`);
    } finally {
      isArtistLoading.value = false;
    }
  }

  function loadMoreArtistSongs() {
    // 目前后端是“热门歌曲一次性返回”，先不做真正分页
    return;
  }

  return {
    artistSongs,
    artistSongsTotal,
    currentArtist,
    isArtistLoading,
    artistPage,
    artistPageSize,
    loadArtistSongs,
    loadMoreArtistSongs,
  };
});

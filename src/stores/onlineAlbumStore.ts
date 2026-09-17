import { ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import type { AlbumInfo, SongInfo } from "@/types/model";
import { i18n } from "@/i18n";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getAlbumDetail } from "@/api/commands/netease";

/**
 * 在线专辑详情。
 *
 * 刻意不做分页：/album 一次性返回完整 songs[]，且专辑曲目数有界
 * （通常 <= 50），分页在这里只会引入额外的状态与 bug。
 */
export const useOnlineAlbumStore = defineStore("onlineAlbum", () => {
  const album = ref<AlbumInfo | null>(null);
  const songs = ref<SongInfo[]>([]);
  const isLoading = ref(false);
  /** 加载失败时置为可读文案；区分「失败」与「不存在」，供视图展示重试。 */
  const errorMessage = ref("");
  let requestId = 0;

  async function loadAlbum(id: string) {
    const currentRequestId = ++requestId;
    // 切换专辑时先清空，避免旧曲目与新专辑头并存
    album.value = null;
    songs.value = [];
    errorMessage.value = "";
    try {
      isLoading.value = true;
      const result = await getAlbumDetail({ id });
      if (currentRequestId !== requestId) return;
      album.value = result.album;
      songs.value = result.songs;
    } catch (error) {
      if (currentRequestId !== requestId) return;
      console.error("加载专辑失败:", error);
      errorMessage.value = parseErrorMessage(error);
      ElMessage.error(
        `${i18n.global.t("errors.loadAlbumFailed")}: ${parseErrorMessage(error)}`
      );
    } finally {
      if (currentRequestId === requestId) isLoading.value = false;
    }
  }

  return { album, songs, isLoading, errorMessage, loadAlbum };
});

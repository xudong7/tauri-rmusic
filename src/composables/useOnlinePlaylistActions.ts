import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { useDownloadStore } from "@/stores/downloadStore";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import type { SongInfo } from "@/types/model";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getLocalFileNameForSong } from "@/utils/songUtils";

/**
 * added 与 already 分开只是为了拼提示文案：两种情况下歌曲现在都在歌单里，
 * 按钮上共用一个打勾。
 */
export type AddToPlaylistOutcome = "added" | "already" | "failed";

export interface AddToPlaylistResult {
  outcome: AddToPlaylistOutcome;
  /** 目标歌单名，供调用方拼 tooltip */
  playlistName: string;
}

export function useOnlinePlaylistActions() {
  const { t } = useI18n();
  const localStore = useLocalMusicStore();
  const playlistStore = usePlaylistStore();
  const downloadStore = useDownloadStore();

  /**
   * 把在线歌曲加入歌单。曲库里还没有这首歌时先下载。
   *
   * 下载交给 downloadStore：它既让该行转圈，又与行上的下载按钮共用同一次
   * 请求——同一首歌并发触发时不会发两遍 download_music。
   * 失败时不再返回文件名，错误提示由 downloadStore 统一弹出（这里再弹一次
   * 就是同一句话连说两遍）。
   */
  async function addOnlineSongToPlaylist(
    command: string,
    song: SongInfo
  ): Promise<AddToPlaylistResult> {
    const playlistId =
      command === "new"
        ? playlistStore.createPlaylist(t("playlist.newPlaylist")).id
        : command;
    const playlistName = () => playlistStore.getPlaylist(playlistId)?.name ?? "";

    try {
      let fileName = getLocalFileNameForSong(song, localStore.musicFiles);

      if (!fileName) {
        fileName = await downloadStore.download(song);
      }

      if (!fileName) return { outcome: "failed", playlistName: playlistName() };

      const added = playlistStore.addToPlaylist(playlistId, {
        type: "local",
        file_name: fileName,
      });
      return {
        outcome: added ? "added" : "already",
        playlistName: playlistName(),
      };
    } catch (error) {
      console.error("添加到播放列表失败:", error);
      ElMessage.error(parseErrorMessage(error));
      return { outcome: "failed", playlistName: playlistName() };
    }
  }

  return {
    addOnlineSongToPlaylist,
  };
}

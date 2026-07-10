import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { downloadMusic } from "@/api/commands/music";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import type { SongInfo } from "@/types/model";
import { parseErrorMessage } from "@/utils/errorUtils";
import { getExpectedDownloadFileName, getLocalFileNameForSong } from "@/utils/songUtils";

export function useOnlinePlaylistActions() {
  const { t } = useI18n();
  const localStore = useLocalMusicStore();
  const playlistStore = usePlaylistStore();

  async function downloadOnlineSong(song: SongInfo) {
    try {
      ElMessage.info(t("download.starting"));
      const fileName = await downloadMusic({
        songHash: song.file_hash,
        songName: song.name,
        artist: song.artists.join(", "),
        defaultDirectory: localStore.defaultDirectory,
      });
      await localStore.refreshCurrentDirectory();
      ElMessage.success(t("download.done", { fileName }));
    } catch (error) {
      console.error("下载歌曲失败:", error);
      ElMessage.error(parseErrorMessage(error));
    }
  }

  async function addOnlineSongToPlaylist(command: string, song: SongInfo) {
    try {
      const playlistId =
        command === "new"
          ? playlistStore.createPlaylist(t("playlist.newPlaylist")).id
          : command;

      let fileName: string | null = getLocalFileNameForSong(song, localStore.musicFiles);
      let didDownload = false;

      if (!fileName) {
        ElMessage.info(t("download.starting"));
        try {
          fileName = await downloadMusic({
            songHash: song.file_hash,
            songName: song.name,
            artist: song.artists?.join(", ") ?? "",
            defaultDirectory: localStore.defaultDirectory,
          });
          didDownload = true;
          await localStore.loadMusicFiles();
        } catch (error: unknown) {
          if (String(error ?? "").includes("file already exists")) {
            await localStore.loadMusicFiles();
            fileName =
              getLocalFileNameForSong(song, localStore.musicFiles) ??
              getExpectedDownloadFileName(song);
          } else {
            ElMessage.error(parseErrorMessage(error));
            return;
          }
        }
      }

      if (!fileName) {
        ElMessage.error(t("errors.unknownError"));
        return;
      }

      const added = playlistStore.addToPlaylist(playlistId, {
        type: "local",
        file_name: fileName,
      });
      const playlistName = playlistStore.getPlaylist(playlistId)?.name ?? "";

      if (added) {
        ElMessage.success(
          didDownload
            ? t("playlist.downloadedAndAdded", { name: playlistName })
            : t("playlist.added", { name: playlistName })
        );
      } else {
        ElMessage.info(t("playlist.alreadyInPlaylist", { name: playlistName }));
      }
    } catch (error) {
      console.error("添加到播放列表失败:", error);
      ElMessage.error(parseErrorMessage(error));
    }
  }

  return {
    downloadOnlineSong,
    addOnlineSongToPlaylist,
  };
}

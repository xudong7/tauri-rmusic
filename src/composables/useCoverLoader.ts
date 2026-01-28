import { ref, computed, watchEffect } from "vue";
import type { MusicFile, SongInfo } from "@/types/model";
import { loadLocalCover } from "@/utils/coverUtils";
import { DEFAULT_COVER_URL } from "@/constants";

export function useCoverLoader(args: {
  currentMusic: () => MusicFile | null;
  currentOnlineSong: () => SongInfo | null;
  getDefaultDirectory: () => string | null;
}) {
  const localCoverUrl = ref("");

  async function refreshLocalCover() {
    const music = args.currentMusic();
    if (!music) {
      localCoverUrl.value = "";
      return;
    }
    localCoverUrl.value = await loadLocalCover(music.file_name, args.getDefaultDirectory);
  }

  watchEffect(() => {
    // 仅当本地曲目变化时刷新本地封面
    void args.currentMusic();
    void refreshLocalCover();
  });

  const coverUrl = computed(() => {
    const online = args.currentOnlineSong();
    if (online?.pic_url) return online.pic_url;
    const local = args.currentMusic();
    if (local && localCoverUrl.value) return localCoverUrl.value;
    return DEFAULT_COVER_URL;
  });

  return { coverUrl, localCoverUrl, refreshLocalCover };
}

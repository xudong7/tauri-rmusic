import { ref, computed, watch } from "vue";
import type { MusicFile, SongInfo } from "@/types/model";
import { loadLocalCover } from "@/utils/coverUtils";
import { DEFAULT_COVER_URL } from "@/constants";

export function useCoverLoader(args: {
  currentMusic: () => MusicFile | null;
  currentOnlineSong: () => SongInfo | null;
  getDefaultDirectory: () => string | null;
}) {
  const localCoverUrl = ref("");
  let requestId = 0;

  const currentLocalFileName = computed(() => args.currentMusic()?.file_name ?? "");

  async function refreshLocalCover(fileName = currentLocalFileName.value) {
    const music = args.currentMusic();
    const nextRequestId = ++requestId;
    if (!music || !fileName) {
      localCoverUrl.value = "";
      return;
    }
    const url = await loadLocalCover(fileName, args.getDefaultDirectory);
    if (nextRequestId === requestId) {
      localCoverUrl.value = url;
    }
  }

  watch(currentLocalFileName, (fileName) => void refreshLocalCover(fileName), {
    immediate: true,
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

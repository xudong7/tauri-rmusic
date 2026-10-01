import { ref, computed, watch } from "vue";
import type { MusicFile, SongInfo } from "@/types/model";
import { loadLocalCover, loadOnlineCover } from "@/utils/coverUtils";
import { DEFAULT_COVER_URL } from "@/constants";

export function useCoverLoader(args: {
  currentMusic: () => MusicFile | null;
  currentOnlineSong: () => SongInfo | null;
  getDefaultDirectory: () => string | null;
}) {
  const localCoverUrl = ref("");
  /**
   * 在线封面解析结果连同来源 URL 一起存：解析是异步的，切歌时若只存结果，
   * 短暂的窗口里会把上一首的封面地址用在新歌上。
   */
  const onlineCoverUrl = ref<{ source: string; resolved: string } | null>(null);
  let requestId = 0;
  let onlineRequestId = 0;

  const currentLocalFileName = computed(() => args.currentMusic()?.file_name ?? "");
  const currentOnlinePicUrl = computed(() => args.currentOnlineSong()?.pic_url ?? "");

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

  // 优先用磁盘缓存（下载一次后本地直读）；没有缓存时才回退到原始 URL
  watch(
    currentOnlinePicUrl,
    async (url) => {
      const nextRequestId = ++onlineRequestId;
      if (!url) {
        onlineCoverUrl.value = null;
        return;
      }
      const resolved = await loadOnlineCover(url);
      if (nextRequestId === onlineRequestId) {
        onlineCoverUrl.value = { source: url, resolved };
      }
    },
    { immediate: true }
  );

  const coverUrl = computed(() => {
    const online = args.currentOnlineSong();
    if (online?.pic_url) {
      const cached = onlineCoverUrl.value;
      return cached?.source === online.pic_url ? cached.resolved : online.pic_url;
    }
    const local = args.currentMusic();
    if (local && localCoverUrl.value) return localCoverUrl.value;
    return DEFAULT_COVER_URL;
  });

  return { coverUrl, localCoverUrl, refreshLocalCover };
}

import { computed, ref, watch, type Ref } from "vue";
import { getSongLyric } from "@/api/commands/netease";
import { loadLocalLyric } from "@/api/commands/file";
import {
  findLyricIndex,
  getCachedLyric,
  parseLyric,
  parseLyricWithTranslation,
  setCachedLyric,
  type LyricLine,
} from "@/utils/lyrics";
import type { MiniPlayerTrackPayload } from "@/composables/useMiniPlayerBridge";

/**
 * 迷你窗的窗内歌词。
 *
 * 与桌面歌词同源：主窗只推曲目身份（在线 id / 本地文件名 + 目录），mini 窗
 * 自己拉取并解析，两个窗口不共享歌词状态。只在歌词面板打开时加载，免得用户
 * 从不看歌词也白拉一次 sidecar。
 *
 * 当前行由本地播放时钟（positionMs，250ms 一帧）推算，不依赖主窗——主窗隐藏
 * 后它的时钟是冻结的。
 */
export function useMiniPlayerLyrics(options: {
  track: Ref<MiniPlayerTrackPayload | null>;
  positionMs: Ref<number>;
  isActive: Ref<boolean>;
}) {
  const lines = ref<LyricLine[]>([]);
  const loading = ref(false);
  const unavailable = ref(false);
  let requestId = 0;

  const activeIndex = computed(() =>
    lines.value.length > 0 ? findLyricIndex(lines.value, options.positionMs.value) : -1
  );

  function sourceKey(track: MiniPlayerTrackPayload): string {
    return track.songId ? `online:${track.songId}` : `local:${track.coverFileName}`;
  }

  async function load() {
    const track = options.track.value;
    const id = ++requestId;
    unavailable.value = false;
    if (!track) {
      lines.value = [];
      return;
    }

    const key = sourceKey(track);
    const cached = getCachedLyric(key);
    if (cached) {
      lines.value = cached;
      unavailable.value = cached.length === 0;
      return;
    }

    loading.value = true;
    try {
      let parsed: LyricLine[] = [];
      if (track.songId) {
        const result = await getSongLyric({ id: track.songId });
        parsed = result.lyric
          ? parseLyricWithTranslation(result.lyric, result.translation)
          : [];
      } else if (track.coverFileName) {
        const text = await loadLocalLyric({
          fileName: track.coverFileName,
          defaultDirectory: track.defaultDirectory,
        });
        parsed = text ? parseLyric(text) : [];
      }
      if (id !== requestId) return;
      if (parsed.length > 0) setCachedLyric(key, parsed);
      lines.value = parsed;
      unavailable.value = parsed.length === 0;
    } catch (error) {
      if (id !== requestId) return;
      console.warn("[迷你播放器] 加载歌词失败:", error);
      lines.value = [];
      unavailable.value = true;
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  watch(
    () => [
      options.isActive.value,
      options.track.value?.songId,
      options.track.value?.coverFileName,
    ],
    () => {
      // 面板打开、或打开期间切歌，都（重新）加载；关着时不动
      if (options.isActive.value) void load();
    },
    { immediate: true }
  );

  return { lines, loading, unavailable, activeIndex };
}

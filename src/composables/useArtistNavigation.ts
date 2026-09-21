import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { resolveArtistByName } from "@/utils/artistNav";
import { splitArtistNames } from "@/utils/songUtils";
import { useOnlineServiceStore } from "@/stores/onlineServiceStore";

export function useArtistNavigation(args: {
  /** 在线歌曲（若有则优先使用 artists[]） */
  currentOnlineSong?: () => SongInfo | null;
  /** 展示用歌手字符串（本地文件解析出来的） */
  localArtistDisplay?: () => string;
  /** 当前歌手（歌手页） */
  currentArtist?: () => ArtistInfo | null;
  /** 在线搜索的歌手列表（用于快速匹配） */
  onlineArtists?: () => ArtistInfo[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const onlineServiceStore = useOnlineServiceStore();

  const artistNames = computed(() => {
    void locale.value;
    const song = args.currentOnlineSong?.();
    if (song?.artists?.length) return song.artists;
    return splitArtistNames(args.localArtistDisplay?.() || "");
  });

  const canNavigateArtist = computed(() => {
    void locale.value;
    return (
      artistNames.value.length > 0 &&
      !artistNames.value.includes(t("common.unknownArtist"))
    );
  });

  /** 在线歌曲的歌手 id 与 artists 一一对应：点谁就用谁的 id */
  function onlineArtistId(name: string): string {
    const song = args.currentOnlineSong?.();
    const index = song?.artists?.indexOf(name) ?? -1;
    if (index < 0) return "";
    return song?.artist_ids?.[index] ?? "";
  }

  /** 返回是否真的发生了跳转（调用方据此决定要不要退出沉浸模式） */
  async function navigateArtistByName(name: string): Promise<boolean> {
    if (!name || name === t("common.unknownArtist")) return false;

    // 解析歌手 id 依赖在线服务，先确保 sidecar 已启动，否则点击会静默失败
    try {
      await onlineServiceStore.ensureStarted();
    } catch {
      ElMessage.error(t("onlineService.unavailable"));
      return false;
    }

    // 在线歌曲：直接用自带的歌手 id，按名字搜出来的可能是同名翻唱
    const directId = onlineArtistId(name);
    if (directId) {
      await router.push({
        name: "Artist",
        params: { id: directId },
        query: { name },
      });
      return true;
    }

    const artist = await resolveArtistByName(name, {
      currentArtist: args.currentArtist?.() ?? undefined,
      onlineArtists: args.onlineArtists?.() ?? undefined,
    });
    if (!artist?.id) return false;

    await router.push({
      name: "Artist",
      params: { id: artist.id },
      query: { name: artist.name, pic_url: artist.pic_url || "" },
    });
    return true;
  }

  return { artistNames, canNavigateArtist, navigateArtistByName };
}

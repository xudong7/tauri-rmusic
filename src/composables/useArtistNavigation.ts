import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { ArtistInfo, SongInfo } from "@/types/model";
import { resolveArtistByName, splitArtistNames } from "@/utils/artistNav";

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

  async function navigateArtistByName(name: string) {
    if (!name) return;
    if (name === t("common.unknownArtist")) return;
    const artist = await resolveArtistByName(name, {
      currentArtist: args.currentArtist?.() ?? undefined,
      onlineArtists: args.onlineArtists?.() ?? undefined,
    });
    if (!artist?.id) return;
    router.push({
      name: "Artist",
      params: { id: artist.id },
      query: { name: artist.name, pic_url: artist.pic_url || "" },
    });
  }

  return { artistNames, canNavigateArtist, navigateArtistByName };
}

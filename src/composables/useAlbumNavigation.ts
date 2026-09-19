import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import type { AlbumInfo, SongInfo } from "@/types/model";
import { resolveAlbumByName } from "@/utils/albumNav";
import { splitArtistNames } from "@/utils/songUtils";
import { useOnlineServiceStore } from "@/stores/onlineServiceStore";

/**
 * 歌曲 → 专辑页的跳转。
 *
 * 专辑 id 不在 SongInfo 里，需要按名字（+歌手）解析；解析依赖在线服务，
 * 所以点击时先确保 sidecar 已启动，否则静默失败会让用户以为按钮坏了。
 */
export function useAlbumNavigation(args: {
  /** 在线歌曲：直接取它的专辑名 */
  currentOnlineSong?: () => SongInfo | null;
  /** 本地文件：从元数据解析出的专辑名 */
  localAlbumDisplay?: () => string;
  /** 本地文件：从元数据解析出的歌手，用于消歧同名专辑 */
  localArtistDisplay?: () => string;
  /** 在线搜索缓存，命中就不必再发请求 */
  onlineAlbums?: () => AlbumInfo[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const onlineServiceStore = useOnlineServiceStore();

  const albumName = computed(() => {
    void locale.value;
    const song = args.currentOnlineSong?.();
    if (song) return song.album?.trim() ?? "";
    return args.localAlbumDisplay?.()?.trim() ?? "";
  });

  const artistName = computed(() => {
    void locale.value;
    const song = args.currentOnlineSong?.();
    if (song?.artists?.length) return song.artists[0];
    // 本地展示串可能已是「A / B」，取主歌手用于消歧即可
    return splitArtistNames(args.localArtistDisplay?.() ?? "")[0] ?? "";
  });

  const canNavigateAlbum = computed(() => Boolean(albumName.value));

  /** 返回是否真的发生了跳转（调用方据此决定要不要退出沉浸模式） */
  async function navigateAlbumByName(): Promise<boolean> {
    if (!albumName.value) return false;

    try {
      await onlineServiceStore.ensureStarted();
    } catch {
      ElMessage.error(t("onlineService.unavailable"));
      return false;
    }

    const album = await resolveAlbumByName(albumName.value, artistName.value, {
      onlineAlbums: args.onlineAlbums?.(),
    });
    if (!album?.id) return false;

    await router.push({ name: "OnlineAlbum", params: { id: album.id } });
    return true;
  }

  return { albumName, canNavigateAlbum, navigateAlbumByName };
}

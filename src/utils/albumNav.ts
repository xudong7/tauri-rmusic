import type { AlbumInfo } from "@/types/model";
import { searchOnlineAlbums } from "@/api/commands/netease";

type ResolveInput = {
  /** 在线搜索的专辑列表（用于快速匹配，命中就不发请求） */
  onlineAlbums?: AlbumInfo[];
};

function pickByName(
  name: string,
  artistName: string,
  list: AlbumInfo[] | undefined
): AlbumInfo | null {
  if (!name || !list?.length) return null;
  return (
    list.find((a) => a.name === name && (!artistName || a.artist.includes(artistName))) ??
    list.find((a) => a.name === name) ??
    null
  );
}

/**
 * 通过专辑名（可带歌手名消歧）解析专辑信息（包含 id），用于跳转专辑页。
 * 优先从已有搜索结果匹配，再兜底调用一次 search_online_albums。
 */
export async function resolveAlbumByName(
  name: string,
  artistName: string,
  input: ResolveInput = {}
): Promise<AlbumInfo | null> {
  const cached = pickByName(name, artistName, input.onlineAlbums);
  if (cached?.id) return cached;

  try {
    const res = await searchOnlineAlbums({
      keywords: [name, artistName].filter(Boolean).join(" "),
      page: 1,
      pagesize: 10,
    });
    return pickByName(name, artistName, res?.albums) ?? res?.albums?.[0] ?? null;
  } catch (e) {
    console.error("解析专辑信息失败:", e);
    return null;
  }
}

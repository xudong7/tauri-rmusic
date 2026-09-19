import type { ArtistInfo } from "@/types/model";
import { searchOnlineArtists } from "@/api/commands/netease";

type ResolveInput = {
  /** 优先从当前歌手/搜索结果中匹配，避免额外请求 */
  currentArtist?: ArtistInfo | null;
  onlineArtists?: ArtistInfo[];
};

function pickByName(name: string, list: ArtistInfo[] | undefined): ArtistInfo | null {
  if (!name || !list?.length) return null;
  return list.find((a) => a.name === name) ?? null;
}

/**
 * 通过歌手名解析歌手信息（包含 id），用于跳转 Artist 页面。
 * - 先从已有候选（currentArtist/onlineArtists）匹配
 * - 再兜底调用一次 search_online_artists 获取 artist id
 *
 * 这里用 search_online_artists 而非 search_online_mix：后者会并发请求
 * 歌曲与歌手两个端点，而此处只需要一个歌手 id。
 */
export async function resolveArtistByName(
  name: string,
  input: ResolveInput = {}
): Promise<ArtistInfo | null> {
  const candidate =
    (input.currentArtist?.name === name ? input.currentArtist : null) ||
    pickByName(name, input.onlineArtists);
  if (candidate?.id) return candidate;

  try {
    const res = await searchOnlineArtists({
      keywords: name,
      page: 1,
      pagesize: 1,
    });
    const artist = res?.artists?.[0];
    return artist?.id ? artist : null;
  } catch (e) {
    console.error("解析歌手信息失败:", e);
    return null;
  }
}

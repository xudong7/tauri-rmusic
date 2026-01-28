import { invoke } from "@tauri-apps/api/core";
import type { ArtistInfo, SearchMixResult } from "@/types/model";

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
 * - 再兜底调用一次 search_online_mix 获取 artist id
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
    const res = await invoke<SearchMixResult>("search_online_mix", {
      keywords: name,
      page: 1,
      pagesize: 1,
      artistLimit: 1,
    });
    const artist = res?.artists?.[0];
    return artist?.id ? artist : null;
  } catch (e) {
    console.error("解析歌手信息失败:", e);
    return null;
  }
}

/**
 * 将展示用歌手字符串拆成多个歌手名。
 * 只支持“逗号一类”的分隔符：英文逗号 `,` / 中文逗号 `，`（及其两侧空格）。
 */
export function splitArtistNames(display: string): string[] {
  if (!display) return [];
  const normalized = display.replace(/\s*(?:,|，)\s*/g, ",").trim();
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 本地封面与歌词加载（供 PlayerBar、ImmersiveView、LyricView 复用）
 */
import { loadLocalCoverPath } from "@/api/commands/file";
import { convertFileSrc } from "@tauri-apps/api/core";

const MAX_SHARED_COVER_ENTRIES = 500;
const sharedCoverCache = new Map<string, string>();
const pendingCoverLoads = new Map<string, Promise<string>>();

function rememberCover(key: string, url: string) {
  sharedCoverCache.delete(key);
  sharedCoverCache.set(key, url);
  while (sharedCoverCache.size > MAX_SHARED_COVER_ENTRIES) {
    const oldestKey = sharedCoverCache.keys().next().value;
    if (!oldestKey) break;
    sharedCoverCache.delete(oldestKey);
  }
}

/** 加载本地封面图 URL；歌词由 LyricView 单独读取，避免封面经 IPC/base64 传输。 */
export async function loadLocalCover(
  fileName: string,
  getDefaultDirectory: () => string | null
): Promise<string> {
  const defaultDirectory = getDefaultDirectory();
  const cacheKey = `${defaultDirectory ?? "<default>"}\u0000${fileName}`;
  const cached = sharedCoverCache.get(cacheKey);
  if (cached !== undefined) {
    rememberCover(cacheKey, cached);
    return cached;
  }

  const pending = pendingCoverLoads.get(cacheKey);
  if (pending) return await pending;

  const request = (async () => {
    try {
      const path = await loadLocalCoverPath({ fileName, defaultDirectory });
      const url = path ? convertFileSrc(path) : "";
      rememberCover(cacheKey, url);
      return url;
    } catch (e) {
      console.error("加载本地封面失败:", e);
      rememberCover(cacheKey, "");
      return "";
    } finally {
      pendingCoverLoads.delete(cacheKey);
    }
  })();

  pendingCoverLoads.set(cacheKey, request);
  return await request;
}

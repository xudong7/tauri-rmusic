/**
 * 本地封面与歌词加载（供 PlayerBar、ImmersiveView、LyricView 复用）
 */
import { loadLocalCoverPath } from "@/api/commands/file";
import { cacheOnlineCover } from "@/api/commands/netease";
import { convertFileSrc } from "@tauri-apps/api/core";

const MAX_SHARED_COVER_ENTRIES = 500;
const sharedCoverCache = new Map<string, string>();
const pendingCoverLoads = new Map<string, Promise<string>>();

const MAX_ONLINE_COVER_ENTRIES = 200;
const onlineCoverCache = new Map<string, string>();
const pendingOnlineCoverLoads = new Map<string, Promise<string>>();

const localCoverUrlCache = new Map<string, string>();
const pendingLocalCoverUrlLoads = new Map<string, Promise<string>>();

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

function rememberOnlineCover(key: string, url: string) {
  onlineCoverCache.delete(key);
  onlineCoverCache.set(key, url);
  while (onlineCoverCache.size > MAX_ONLINE_COVER_ENTRIES) {
    const oldestKey = onlineCoverCache.keys().next().value;
    if (!oldestKey) break;
    onlineCoverCache.delete(oldestKey);
  }
}

/** 本地路径 → 系统媒体控件可读的 file:// URL（转义 #/?，Windows 反斜杠转正） */
export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return `file://${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/**
 * 本地封面的 file:// URL，专给系统媒体控制用。
 *
 * 和 loadLocalCover 分开：那条返回 asset 协议的 URL 供 webview 渲染，
 * 系统控件（Now Playing / SMTC / MPRIS）只认 file:// 或 http(s)。
 */
export async function loadLocalCoverFileUrl(
  fileName: string,
  getDefaultDirectory: () => string | null
): Promise<string> {
  const defaultDirectory = getDefaultDirectory();
  const cacheKey = `${defaultDirectory ?? "<default>"}\u0000${fileName}`;
  const cached = localCoverUrlCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const pending = pendingLocalCoverUrlLoads.get(cacheKey);
  if (pending) return await pending;

  const request = (async () => {
    try {
      const path = await loadLocalCoverPath({ fileName, defaultDirectory });
      const url = path ? toFileUrl(path) : "";
      localCoverUrlCache.set(cacheKey, url);
      return url;
    } catch (error) {
      console.error("加载本地封面路径失败:", error);
      localCoverUrlCache.set(cacheKey, "");
      return "";
    } finally {
      pendingLocalCoverUrlLoads.delete(cacheKey);
    }
  })();

  pendingLocalCoverUrlLoads.set(cacheKey, request);
  return await request;
}

/**
 * 解析在线封面 URL：优先返回磁盘缓存经 asset 协议暴露的本地地址。
 *
 * 首次调用会通过 IPC 下载并落盘；失败返回原始 URL，让浏览器照旧走网络，
 * 封面只是装饰，不能因为缓存失败而不显示。同一 URL 的内存缓存避免列表
 * 反复经 IPC。
 */
export async function loadOnlineCover(url: string): Promise<string> {
  if (!url) return "";
  const cached = onlineCoverCache.get(url);
  if (cached !== undefined) {
    rememberOnlineCover(url, cached);
    return cached;
  }

  const pending = pendingOnlineCoverLoads.get(url);
  if (pending) return await pending;

  const request = (async () => {
    try {
      const path = await cacheOnlineCover({ url });
      const resolved = path ? convertFileSrc(path) : url;
      rememberOnlineCover(url, resolved);
      return resolved;
    } catch (error) {
      console.error("缓存在线封面失败:", error);
      rememberOnlineCover(url, url);
      return url;
    } finally {
      pendingOnlineCoverLoads.delete(url);
    }
  })();

  pendingOnlineCoverLoads.set(url, request);
  return await request;
}

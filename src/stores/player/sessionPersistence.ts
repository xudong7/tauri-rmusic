import { PLAYER_SESSION_VERSION, STORAGE_KEY_PLAYER_SESSION } from "@/constants";
import type { SongInfo } from "@/types/model";

/**
 * 上次播放会话的持久化格式。
 *
 * 只存「重新放出来需要的最小集」：本地曲目存 `relative_path || file_name`
 * （曲库里的稳定键），在线曲目存完整 SongInfo（队列与播放都要用它），
 * 队列各留当前曲目两侧的一段。
 */
export interface PlayerSessionSnapshot {
  version: number;
  positionMs: number;
  /** 非空时播放上下文是某个自建歌单，队列由歌单派生，不需要存 */
  playlistId: string | null;
  localKey: string | null;
  onlineSong: SongInfo | null;
  localQueueKeys: string[];
  onlineQueue: SongInfo[];
}

function isSongInfo(value: unknown): value is SongInfo {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<SongInfo>;
  return (
    typeof song.id === "string" &&
    song.id.length > 0 &&
    typeof song.name === "string" &&
    Array.isArray(song.artists) &&
    song.artists.every((artist) => typeof artist === "string")
  );
}

/** 解析存储中的会话；结构不符（旧版本、手改、损坏）时返回 null，调用方当作没有会话 */
export function parsePlayerSession(raw: string | null): PlayerSessionSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const value = parsed as Record<string, unknown>;
  if (value.version !== PLAYER_SESSION_VERSION) return null;

  const localKey =
    typeof value.localKey === "string" && value.localKey ? value.localKey : null;
  const onlineSong = isSongInfo(value.onlineSong) ? value.onlineSong : null;
  // 两个都没有 = 没有可恢复的曲目，当作空会话
  if (!localKey && !onlineSong) return null;

  return {
    version: PLAYER_SESSION_VERSION,
    positionMs:
      typeof value.positionMs === "number" && Number.isFinite(value.positionMs)
        ? Math.max(0, value.positionMs)
        : 0,
    playlistId:
      typeof value.playlistId === "string" && value.playlistId ? value.playlistId : null,
    localKey,
    onlineSong,
    localQueueKeys: Array.isArray(value.localQueueKeys)
      ? value.localQueueKeys.filter(
          (key): key is string => typeof key === "string" && key.length > 0
        )
      : [],
    onlineQueue: Array.isArray(value.onlineQueue)
      ? value.onlineQueue.filter(isSongInfo)
      : [],
  };
}

export function readPlayerSession(): PlayerSessionSnapshot | null {
  try {
    return parsePlayerSession(localStorage.getItem(STORAGE_KEY_PLAYER_SESSION));
  } catch (error) {
    console.warn("[播放会话] 读取失败:", error);
    return null;
  }
}

export function writePlayerSession(snapshot: PlayerSessionSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY_PLAYER_SESSION, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[播放会话] 写入失败:", error);
  }
}

export function clearPlayerSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PLAYER_SESSION);
  } catch (error) {
    console.warn("[播放会话] 清理失败:", error);
  }
}

/**
 * 队列超长时保留当前曲目两侧的一段。
 *
 * 从当前曲目往两边各取一半，而不是从头截取：恢复后「上一首/下一首」要能
 * 沿原来的方向继续走，当前曲目必须是窗口的一部分。
 */
export function windowQueue<T>(queue: T[], currentIndex: number, limit: number): T[] {
  if (queue.length <= limit) return [...queue];
  const half = Math.floor(limit / 2);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const start = Math.min(Math.max(0, safeIndex - half), queue.length - limit);
  return queue.slice(start, start + limit);
}

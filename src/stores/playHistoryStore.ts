import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { STORAGE_KEY_PLAY_HISTORY, PLAY_HISTORY_MAX_ITEMS } from "@/constants";
import type { SongInfo } from "@/types/model";
import { readJsonFromStorage, writeJsonToStorage } from "@/utils/storage";

/** 播放记录里的本地曲目快照：文件被删后这一行还能显示歌名/歌手 */
export interface PlayHistoryLocalSnapshot {
  file_name: string;
  title: string;
  artist: string;
  /** 专辑：列表的专辑列要用；文件被删后也能显示 */
  album?: string;
}

/**
 * 一条播放记录。
 *
 * 在线曲目整份存 SongInfo：重新播放、取封面都要用它，而歌单/搜索状态早就不在
 * 手上了。本地曲目只存展示所需的快照，真正的文件由 localMusicStore 现查——
 * 查不到就是文件已被删除。
 */
export interface PlayHistoryEntry {
  /** `local:<file_name>` 或 `online:<id>`，同曲重复播放只更新这一条 */
  key: string;
  source: "local" | "online";
  /** 最近一次播放的时间戳 */
  playedAt: number;
  /** 累计播放次数 */
  playCount: number;
  local?: PlayHistoryLocalSnapshot;
  online?: SongInfo;
}

function isValidEntry(value: unknown): value is PlayHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<PlayHistoryEntry>;
  if (typeof raw.key !== "string" || !raw.key) return false;
  if (raw.source !== "local" && raw.source !== "online") return false;
  if (typeof raw.playedAt !== "number") return false;
  if (raw.source === "local") {
    const local = raw.local as Partial<PlayHistoryLocalSnapshot> | undefined;
    return Boolean(local && typeof local.file_name === "string" && local.file_name);
  }
  const online = raw.online as Partial<SongInfo> | undefined;
  return Boolean(online && typeof online.id === "string" && online.id);
}

function loadFromStorage(): PlayHistoryEntry[] {
  return readJsonFromStorage<PlayHistoryEntry[]>(
    STORAGE_KEY_PLAY_HISTORY,
    [],
    (value) => {
      if (!Array.isArray(value)) return [];
      return value.filter(isValidEntry).slice(0, PLAY_HISTORY_MAX_ITEMS);
    }
  );
}

/**
 * 播放历史。
 *
 * 与「最近添加」那种曲库属性不同，这是一份纯前端统计：条目按最近播放倒序，
 * 超出上限丢最旧的。写入发生在播放成功之后（playerStore），失败与跳过不计。
 */
export const usePlayHistoryStore = defineStore("playHistory", () => {
  const entries = ref<PlayHistoryEntry[]>(loadFromStorage());

  /** 最近播放：按时间倒序 */
  const recentEntries = computed(() =>
    [...entries.value].sort((a, b) => b.playedAt - a.playedAt)
  );

  /** 最常播放：次数优先，次数相同按最近播放 */
  const mostPlayedEntries = computed(() =>
    [...entries.value].sort(
      (a, b) => b.playCount - a.playCount || b.playedAt - a.playedAt
    )
  );

  function persist() {
    writeJsonToStorage(STORAGE_KEY_PLAY_HISTORY, entries.value);
  }

  function recordPlay(input: {
    source: "local" | "online";
    local?: PlayHistoryLocalSnapshot;
    online?: SongInfo;
  }) {
    const key =
      input.source === "local"
        ? `local:${input.local?.file_name ?? ""}`
        : `online:${input.online?.id ?? ""}`;
    if (key.endsWith(":")) return;

    const existing = entries.value.find((entry) => entry.key === key);
    if (existing) {
      existing.playedAt = Date.now();
      existing.playCount += 1;
      // 快照跟着刷新：歌名/歌手/封面在服务端可能变过
      if (input.local) existing.local = input.local;
      if (input.online) existing.online = input.online;
    } else {
      entries.value.push({
        key,
        source: input.source,
        playedAt: Date.now(),
        playCount: 1,
        local: input.local,
        online: input.online,
      });
    }

    // 超出上限时丢最旧的（按时间，而不是按数组顺序）
    if (entries.value.length > PLAY_HISTORY_MAX_ITEMS) {
      entries.value = [...entries.value]
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, PLAY_HISTORY_MAX_ITEMS);
    }

    persist();
  }

  function clearHistory() {
    entries.value = [];
    persist();
  }

  return { entries, recentEntries, mostPlayedEntries, recordPlay, clearHistory };
});

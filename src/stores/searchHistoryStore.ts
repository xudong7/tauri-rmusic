import { ref } from "vue";
import { defineStore } from "pinia";
import { SEARCH_HISTORY_MAX_ITEMS, STORAGE_KEY_SEARCH_HISTORY } from "@/constants";
import { ViewMode } from "@/types/model";
import { readJsonFromStorage, writeJsonToStorage } from "@/utils/storage";

type HistoryKey = "local" | "online";

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string")
    : [];
}

function loadFromStorage(): Record<HistoryKey, string[]> {
  return readJsonFromStorage<Record<HistoryKey, string[]>>(
    STORAGE_KEY_SEARCH_HISTORY,
    { local: [], online: [] },
    (value) => {
      const parsed = (value ?? {}) as Record<string, unknown>;
      return {
        local: toStringList(parsed.local).slice(0, SEARCH_HISTORY_MAX_ITEMS),
        online: toStringList(parsed.online).slice(0, SEARCH_HISTORY_MAX_ITEMS),
      };
    }
  );
}

function toKey(mode: ViewMode): HistoryKey {
  return mode === ViewMode.LOCAL ? "local" : "online";
}

/** 搜索历史 store：按本地/在线分别持久化到 localStorage，支持增、删、清 */
export const useSearchHistoryStore = defineStore("searchHistory", () => {
  const data = ref<Record<HistoryKey, string[]>>(loadFromStorage());

  function getHistory(mode: ViewMode): string[] {
    return data.value[toKey(mode)];
  }

  function add(keyword: string, mode: ViewMode) {
    const k = keyword.trim();
    if (!k) return;
    const key = toKey(mode);
    const list = [...data.value[key]];
    const idx = list.indexOf(k);
    if (idx !== -1) list.splice(idx, 1);
    list.unshift(k);
    data.value = { ...data.value, [key]: list.slice(0, SEARCH_HISTORY_MAX_ITEMS) };
    writeJsonToStorage(STORAGE_KEY_SEARCH_HISTORY, data.value);
  }

  function remove(item: string, mode: ViewMode) {
    const key = toKey(mode);
    const list = data.value[key].filter((s) => s !== item);
    data.value = { ...data.value, [key]: list };
    writeJsonToStorage(STORAGE_KEY_SEARCH_HISTORY, data.value);
  }

  function clear(mode: ViewMode) {
    const key = toKey(mode);
    data.value = { ...data.value, [key]: [] };
    writeJsonToStorage(STORAGE_KEY_SEARCH_HISTORY, data.value);
  }

  return {
    getHistory,
    add,
    remove,
    clear,
  };
});

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { SEARCH_HISTORY_MAX_ITEMS, STORAGE_KEY_SEARCH_HISTORY } from "@/constants";
import { ViewMode } from "@/types/model";

type HistoryKey = "local" | "online";

function loadFromStorage(): Record<HistoryKey, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEARCH_HISTORY);
    if (!raw) return { local: [], online: [] };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const local = Array.isArray(parsed.local)
      ? parsed.local.filter((s): s is string => typeof s === "string")
      : [];
    const online = Array.isArray(parsed.online)
      ? parsed.online.filter((s): s is string => typeof s === "string")
      : [];
    return {
      local: local.slice(0, SEARCH_HISTORY_MAX_ITEMS),
      online: online.slice(0, SEARCH_HISTORY_MAX_ITEMS),
    };
  } catch {
    return { local: [], online: [] };
  }
}

function saveToStorage(data: Record<HistoryKey, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY_SEARCH_HISTORY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function toKey(mode: ViewMode): HistoryKey {
  return mode === ViewMode.LOCAL ? "local" : "online";
}

/** 搜索历史 store：按本地/在线分别持久化到 localStorage，支持增、删、清 */
export const useSearchHistoryStore = defineStore("searchHistory", () => {
  const data = ref<Record<HistoryKey, string[]>>(loadFromStorage());

  const localHistory = computed(() => data.value.local);
  const onlineHistory = computed(() => data.value.online);

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
    saveToStorage(data.value);
  }

  function remove(item: string, mode: ViewMode) {
    const key = toKey(mode);
    const list = data.value[key].filter((s) => s !== item);
    data.value = { ...data.value, [key]: list };
    saveToStorage(data.value);
  }

  function clear(mode: ViewMode) {
    const key = toKey(mode);
    data.value = { ...data.value, [key]: [] };
    saveToStorage(data.value);
  }

  return {
    localHistory,
    onlineHistory,
    getHistory,
    add,
    remove,
    clear,
  };
});

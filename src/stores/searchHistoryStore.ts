import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { ViewMode } from "@/types/model";

const STORAGE_KEY = "rmusic-search-history";
const MAX_ITEMS = 20;

type HistoryKey = "local" | "online";

function loadFromStorage(): Record<HistoryKey, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { local: [], online: [] };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const local = Array.isArray(parsed.local)
      ? parsed.local.filter((s): s is string => typeof s === "string")
      : [];
    const online = Array.isArray(parsed.online)
      ? parsed.online.filter((s): s is string => typeof s === "string")
      : [];
    return { local: local.slice(0, MAX_ITEMS), online: online.slice(0, MAX_ITEMS) };
  } catch {
    return { local: [], online: [] };
  }
}

function saveToStorage(data: Record<HistoryKey, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function toKey(mode: ViewMode): HistoryKey {
  return mode === ViewMode.LOCAL ? "local" : "online";
}

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
    data.value = { ...data.value, [key]: list.slice(0, MAX_ITEMS) };
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

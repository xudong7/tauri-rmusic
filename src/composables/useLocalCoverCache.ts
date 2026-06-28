import { reactive } from "vue";
import { loadLocalCover } from "@/utils/coverUtils";

export interface UseLocalCoverCacheOptions<T> {
  getKey: (item: T) => string | number;
  getFileName: (item: T) => string;
  getDefaultDirectory: () => string | null;
  concurrency?: number;
}

const DEFAULT_COVER_CONCURRENCY = 4;

export function useLocalCoverCache<T>(options: UseLocalCoverCacheOptions<T>) {
  const coverByKey = reactive<Record<string, string>>({});
  const queue: T[] = [];
  const pendingKeys = new Set<string>();
  let running = 0;

  function normalizeKey(item: T): string {
    return String(options.getKey(item));
  }

  function pumpQueue() {
    const maxConcurrency = options.concurrency ?? DEFAULT_COVER_CONCURRENCY;
    while (running < maxConcurrency && queue.length > 0) {
      const item = queue.shift()!;
      const key = normalizeKey(item);
      if (coverByKey[key] !== undefined) {
        pendingKeys.delete(key);
        continue;
      }

      running++;
      void (async () => {
        try {
          const url = await loadLocalCover(
            options.getFileName(item),
            options.getDefaultDirectory
          );
          coverByKey[key] = url || "";
        } catch {
          coverByKey[key] = "";
        } finally {
          pendingKeys.delete(key);
          running--;
          pumpQueue();
        }
      })();
    }
  }

  function schedule(item: T) {
    const key = normalizeKey(item);
    if (coverByKey[key] !== undefined || pendingKeys.has(key)) return;
    pendingKeys.add(key);
    queue.push(item);
    pumpQueue();
  }

  function scheduleMany(items: T[]) {
    for (const item of items) schedule(item);
  }

  function getCover(item: T): string {
    return coverByKey[normalizeKey(item)] ?? "";
  }

  return {
    coverByKey,
    getCover,
    schedule,
    scheduleMany,
  };
}

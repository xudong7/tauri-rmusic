/**
 * 带 TTL 与 LRU 上限的小缓存。
 *
 * 用于「重新进入同一页面不必重新发请求」这类场景：条目过期即视为未命中，
 * 超过上限时淘汰最久未使用的条目。不做主动过期清理——只在下一次 get/set
 * 时顺手丢弃过期项，桌面应用这点内存没有扫描的价值。
 */
export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 50): TtlCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      // 重新插入以刷新 LRU 顺序
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key: string, value: T): void {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },

    delete(key: string): void {
      entries.delete(key);
    },

    clear(): void {
      entries.clear();
    },

    get size(): number {
      return entries.size;
    },
  };
}

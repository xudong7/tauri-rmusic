/**
 * localStorage 的 JSON 读写。
 *
 * 解析/写入失败（隐私模式、配额、历史脏数据）时静默降级：
 * 存储只承载偏好，不值得因为读不出来就让整个页面报错。
 */

export function readJsonFromStorage<T>(
  key: string,
  fallback: T,
  normalize?: (value: unknown) => T
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return normalize ? normalize(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJsonToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * 把「键 → 值」的映射裁剪到最多 limit 条，保留最近插入的（对象键的插入顺序）。
 * 用于那些只增不减的索引，避免 localStorage 在长期使用后越写越大。
 */
export function trimRecordToLimit<T>(
  record: Record<string, T>,
  limit: number
): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= limit) return record;

  const next: Record<string, T> = {};
  for (const key of keys.slice(keys.length - limit)) {
    next[key] = record[key];
  }
  return next;
}

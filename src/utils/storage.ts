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

export interface LyricLine {
  time: number;
  text: string;
  /** 翻译（tlyric）；无翻译的行没有这个字段 */
  translation?: string;
}

const lyricCache = new Map<string, LyricLine[]>();
const MAX_LYRIC_CACHE_ENTRIES = 80;

function touchCacheKey(key: string, value: LyricLine[]) {
  if (lyricCache.has(key)) lyricCache.delete(key);
  lyricCache.set(key, value);

  while (lyricCache.size > MAX_LYRIC_CACHE_ENTRIES) {
    const oldestKey = lyricCache.keys().next().value;
    if (!oldestKey) break;
    lyricCache.delete(oldestKey);
  }
}

export function getCachedLyric(key: string): LyricLine[] | undefined {
  const cached = lyricCache.get(key);
  if (!cached) return undefined;
  touchCacheKey(key, cached);
  return cached;
}

export function setCachedLyric(key: string, lines: LyricLine[]) {
  touchCacheKey(key, lines);
}

export function parseLyric(lrc: string): LyricLine[] {
  if (!lrc) return [];

  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  for (const line of lrc.split("\n")) {
    const matches = Array.from(line.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const text = line.replace(timeRegex, "").trim();
    if (!text) continue;

    for (const match of matches) {
      const minutes = Number.parseInt(match[1], 10);
      const seconds = Number.parseInt(match[2], 10);
      const milliseconds = Number.parseInt(match[3].padEnd(3, "0"), 10);
      result.push({
        time: minutes * 60 * 1000 + seconds * 1000 + milliseconds,
        text,
      });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * 合并原文与翻译：按时间戳精确配对（tlyric 与 lrc 共用同一组时间戳）。
 * 翻译里对不上的时间戳直接丢弃——错位显示比不显示更糟。
 */
export function parseLyricWithTranslation(
  lyric: string,
  translation: string
): LyricLine[] {
  const lines = parseLyric(lyric);
  const translated = parseLyric(translation);
  if (translated.length === 0) return lines;

  const translationByTime = new Map<number, string>();
  for (const line of translated) {
    if (!translationByTime.has(line.time)) translationByTime.set(line.time, line.text);
  }

  return lines.map((line) => {
    const text = translationByTime.get(line.time);
    return text ? { ...line, translation: text } : line;
  });
}

export function findLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= currentTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

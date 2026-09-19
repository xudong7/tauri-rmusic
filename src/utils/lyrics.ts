export interface LyricLine {
  time: number;
  text: string;
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

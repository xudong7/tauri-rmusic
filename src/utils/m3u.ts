import type { MusicFile } from "@/types/model";
import { joinPathSegment } from "@/utils/pathUtils";

export interface M3uEntry {
  /** 文件路径：可能是绝对路径、相对路径，或只是文件名 */
  path: string;
  /** #EXTINF 里的标题 */
  title?: string;
  durationMs?: number;
}

/**
 * 解析 M3U / M3U8。
 *
 * 只认两种行：`#EXTINF:秒数,标题` 与路径行。其余 `#` 注释与空行忽略。
 * 路径行与「最近一条 EXTINF」配对，没有 EXTINF 的裸路径也算一条——有些导出器
 * （包括我们自己的简版）只写路径。
 */
export function parseM3u(text: string): M3uEntry[] {
  const entries: M3uEntry[] = [];
  let pending: Pick<M3uEntry, "title" | "durationMs"> | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      const extinf = line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)\s*,(.*)$/i);
      if (extinf) {
        const seconds = Number.parseFloat(extinf[1]);
        pending = {
          title: extinf[2].trim() || undefined,
          durationMs:
            Number.isFinite(seconds) && seconds > 0
              ? Math.round(seconds * 1000)
              : undefined,
        };
      }
      continue;
    }

    entries.push({ path: line, ...(pending ?? {}) });
    pending = null;
  }

  return entries;
}

/** 生成 M3U 文本：UTF-8 无 BOM、LF 换行，时长未知写 -1（M3U 惯例） */
export function buildM3u(
  entries: { path: string; title?: string; durationMs?: number }[]
): string {
  const lines = ["#EXTM3U"];
  for (const entry of entries) {
    const seconds =
      entry.durationMs && entry.durationMs > 0 ? Math.round(entry.durationMs / 1000) : -1;
    lines.push(`#EXTINF:${seconds},${entry.title ?? ""}`);
    lines.push(entry.path);
  }
  return `${lines.join("\n")}\n`;
}

/** 路径比较用：统一分隔符与大小写（Windows 与 macOS 默认都不区分大小写） */
function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").trim().toLowerCase();
}

/**
 * 把 M3U 条目匹配回曲库。
 *
 * 先按「曲库目录 + 文件名」拼出的绝对路径精确匹配，再退回按文件名匹配：
 * 别人导出的播放列表里存的是他那台机器的路径，只有文件名还能对上。
 * 匹配不上的计入 missing，由调用方汇总提示。
 */
export function matchM3uEntries(
  entries: M3uEntry[],
  files: MusicFile[],
  currentDirectory: string
): { matched: MusicFile[]; missing: number } {
  const byPath = new Map<string, MusicFile>();
  const byName = new Map<string, MusicFile>();
  for (const file of files) {
    byPath.set(normalizePath(joinPathSegment(currentDirectory, file.file_name)), file);
    const name = normalizePath(file.file_name);
    if (!byName.has(name)) byName.set(name, file);
  }

  const matched: MusicFile[] = [];
  const seen = new Set<string>();
  let missing = 0;

  for (const entry of entries) {
    const normalized = normalizePath(entry.path);
    const basename = normalized.split("/").pop() ?? "";
    const file = byPath.get(normalized) ?? byName.get(basename);
    if (!file) {
      missing += 1;
      continue;
    }
    // 同一首歌在列表里出现多次时只收一条
    const key = file.relative_path || file.file_name;
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(file);
  }

  return { matched, missing };
}

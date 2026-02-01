/** 应用常量统一入口，便于维护与按需引入 */

/* ---------- localStorage 键名 ---------- */
export const STORAGE_KEY_SEARCH_HISTORY = "rmusic-search-history";
export const STORAGE_KEY_THEME = "theme";
export const STORAGE_KEY_DEFAULT_DIRECTORY = "defaultDirectory";
export const STORAGE_KEY_LOCALE = "locale";
export const STORAGE_KEY_SIDEBAR_PLAYLIST_EXPANDED = "sidebar_playlist_expanded";

/* ---------- 搜索历史 ---------- */
/** 单模式（本地/在线）最多保留条数 */
export const SEARCH_HISTORY_MAX_ITEMS = 20;

/* ---------- 播放列表 ---------- */
/** 防抖写入延迟（ms），避免连续多次写入后端 */
export const PLAYLIST_SAVE_DEBOUNCE_MS = 300;

/* ---------- 列表与虚拟滚动 ---------- */
/** 默认封面图路径（对应 public/icon.png） */
export const DEFAULT_COVER_URL = "/icon.png";

/** 列表行高（与 CSS .list-row min-height + margin-bottom 一致），用于虚拟滚动计算 */
export const LIST_ROW_HEIGHT = 64;

/** 超过该数量时启用虚拟滚动，避免大量 DOM 导致卡顿 */
export const VIRTUAL_LIST_THRESHOLD = 20;

/** 虚拟滚动预渲染条数（可视区上下各多渲染，减少快速滚动空白） */
export const VIRTUAL_LIST_OVERSCAN = 10;

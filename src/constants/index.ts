/** 应用常量统一入口，便于维护与按需引入 */

/* ---------- localStorage 键名 ---------- */
export const STORAGE_KEY_SEARCH_HISTORY = "rmusic-search-history";
export const STORAGE_KEY_THEME = "theme";
export const STORAGE_KEY_DEFAULT_DIRECTORY = "defaultDirectory";
export const STORAGE_KEY_LOCALE = "locale";
export const STORAGE_KEY_SIDEBAR_PLAYLIST_EXPANDED = "sidebar_playlist_expanded";
export const STORAGE_KEY_PLAYER_VOLUME = "player_volume";
export const STORAGE_KEY_PLAY_MODE = "play_mode";

/* ---------- 搜索历史 ---------- */
/** 单模式（本地/在线）最多保留条数 */
export const SEARCH_HISTORY_MAX_ITEMS = 6;

/* ---------- 播放列表 ---------- */
/** 防抖写入延迟（ms），避免连续多次写入后端 */
export const PLAYLIST_SAVE_DEBOUNCE_MS = 300;

/* ---------- 窗口 ---------- */
/**
 * 窗口可缩到的最小宽度。
 *
 * 900 的来由是列表网格：`--app-track-grid` 的最小宽度为
 * 40+180+140+48 加三个 12px 间隙 = 444px，再加行内边距 16、容器内边距 8、
 * 滚动条槽位 4，列表至少需要 472px；连同侧边栏 192 与内容区左右内边距 64，
 * 窗口下限是 728px。取 900 是因为它同时高过 840px 那条断点（侧边栏与内容区
 * 内边距会在那里收窄），这样任何宽度下布局都不重排，缩放时变的只有列表宽度
 * 本身；900 时歌名列还有 272px。
 *
 * 必须与 src-tauri/tauri.conf.json、src-tauri/tauri.macos.conf.json 里的
 * minWidth 保持一致：那两个是 OS 层的约束，这里在启动时再补一次（恢复上次
 * 窗口尺寸时可能小于最小值）。两边对不上就会出现"能拖得更窄"的窗口。
 */
export const WINDOW_MIN_WIDTH = 900;
export const WINDOW_MIN_HEIGHT = 640;

/* ---------- 列表与虚拟滚动 ---------- */
/** 默认封面图路径（对应 public/icon.png） */
export const DEFAULT_COVER_URL = "/icon.png";

/**
 * 列表行高，用于虚拟滚动计算。
 * 必须与 CSS 的 --app-track-row-height 一致（那里还含上下各 8px 内边距，
 * 实际边框盒高度 = 这个值），否则滚动位置会随行数累积漂移。
 */
export const LIST_ROW_HEIGHT = 56;

/** 超过该数量时启用虚拟滚动，避免大量 DOM 导致卡顿 */
export const VIRTUAL_LIST_THRESHOLD = 50;

/** 虚拟滚动预渲染条数（可视区上下各多渲染，减少快速滚动空白） */
export const VIRTUAL_LIST_OVERSCAN = 10;

/**
 * 播放队列行高，对应 .queue-item 的高度（队列条目文本单行截断，高度因此固定）。
 * 虚拟滚动要求行高精确，否则滚动位置会累积漂移。
 *
 * 与 LIST_ROW_HEIGHT 相同，队列行和主页列表行看起来才是同一套语言：
 * 封面 34 + 上下内边距各 8。参考图实测两者行距都是 57.7px ÷ 1.15。
 */
export const QUEUE_ROW_HEIGHT = 56;

/** 队列行封面尺寸，与主页列表保持一致 */
export const QUEUE_COVER_SIZE = 40;

/** 队列行封面圆角。CSS 读不到 TS 常量，所以这个值由模板同时喂给
 *  CoverImage 的 :radius 和封面容器的 borderRadius，保证两处不会写岔。 */
export const QUEUE_COVER_RADIUS = 6;

/* ---------- 封面实体网格（歌单 / 专辑 / 排行榜） ---------- */
/**
 * 网格条数软上限。超出后不再加载，改为提示用户细化搜索。
 * 这是刻意的产品取舍：用上限换掉手写二维虚拟化的复杂度与风险。
 *
 * 每页条数不在这里：它只被 onlineMusicStore 用于分页请求，
 * 属于该 store 的内部细节（见其 GRID_SEARCH_PAGE_SIZE）。
 */
export const MAX_GRID_ITEMS = 200;

/** 网格触底加载阈值（px），与 TrackList 默认值保持一致 */
export const GRID_NEAR_END_THRESHOLD = 220;

/* ---------- 在线歌单 ---------- */
/**
 * 歌单曲目首屏拉取条数。实测 /playlist/detail 对 <=200 首的歌单会一次性返回
 * 全部曲目，因此按此上限首屏取满即可覆盖绝大多数歌单。
 *
 * 这同时规避了播放队列的快照问题：usePlaybackQueue 会复制传入数组，
 * 若首屏只取 20 首，播放第 3 首时队列里就只有 20 首。
 */
export const PLAYLIST_TRACKS_PAGE_SIZE = 200;

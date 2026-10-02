/** 应用常量统一入口，便于维护与按需引入 */

/* ---------- localStorage 键名 ---------- */
export const STORAGE_KEY_SEARCH_HISTORY = "rmusic-search-history";
export const STORAGE_KEY_THEME = "theme";
export const STORAGE_KEY_DEFAULT_DIRECTORY = "defaultDirectory";
export const STORAGE_KEY_LOCALE = "locale";
export const STORAGE_KEY_PLAYER_VOLUME = "player_volume";
export const STORAGE_KEY_PLAY_MODE = "play_mode";
export const STORAGE_KEY_COLLECTED_PLAYLISTS = "rmusic-collected-playlists";
export const STORAGE_KEY_COLLECTED_ALBUMS = "rmusic-collected-albums";
/** 下载过的歌曲：文件名 → 来源，用于「删了之后重新下载」 */
export const STORAGE_KEY_DOWNLOAD_SOURCES = "rmusic-download-sources";
/** 本地曲库排序方式 */
export const STORAGE_KEY_LIBRARY_SORT = "rmusic-library-sort";
/** 歌词偏移（毫秒） */
export const STORAGE_KEY_LYRIC_OFFSET = "rmusic-lyric-offset";
/** 桌面歌词字号（px） */
export const STORAGE_KEY_LYRICS_FONT_SIZE = "rmusic-lyrics-font-size";
/** 上次会话：曲目/队列/进度，启动时恢复 */
export const STORAGE_KEY_PLAYER_SESSION = "rmusic-player-session";
/** 上次所在路由，启动时恢复 */
export const STORAGE_KEY_LAST_ROUTE = "rmusic-last-route";

/* ---------- 播放会话 ---------- */
/** 会话结构版本。字段不兼容变更时递增，旧版本直接丢弃。 */
export const PLAYER_SESSION_VERSION = 1;
/** 队列只持久化当前曲目两侧的这么多条，避免整库撑爆 localStorage */
export const PLAYER_SESSION_QUEUE_LIMIT = 200;
/** 播放中进度写盘的节流间隔（ms） */
export const PLAYER_SESSION_WRITE_INTERVAL_MS = 3000;

/* ---------- 搜索历史 ---------- */
/** 单模式（本地/在线）最多保留条数 */
export const SEARCH_HISTORY_MAX_ITEMS = 6;

/* ---------- 导入 ---------- */
/** 支持的音频扩展名：导入对话框与「拖文件进窗口」共用同一份 */
export const AUDIO_FILE_EXTENSIONS = ["mp3", "wav", "ogg", "flac"];

/* ---------- 播放列表 ---------- */
/** 防抖写入延迟（ms），避免连续多次写入后端 */
export const PLAYLIST_SAVE_DEBOUNCE_MS = 300;

/* ---------- 窗口 ---------- */
/**
 * 窗口可缩到的最小尺寸：宽 1200、高 800。
 *
 * 宽度就是默认开窗宽度，也是整套布局被调出来的那个宽度——不允许再拖得更窄，
 * 于是「列表不重排」由窗口最小宽度保证，而不是由断点保证：`--app-track-grid`
 * 的下限是 40+180+160+48 加三个 12px 间隙 = 464px，加上行内边距 40、容器内边距
 * 8、滚动条槽位 4，列表共需约 516px；1200 下实测列表拿到 899px，歌名列 365px、
 * 专辑列 278px。它也高过 840px 那条断点（侧边栏与内容区在更窄时才收窄）。
 *
 * 高度由设置页定：它是全应用最高的一页（五组），实测需要约 730px 才不出现滚动
 * 条——720 下最后一行「关于」进不了视口，740 才放得下。取 800 留约 70px 余量。
 *
 * 之前是 1200×640：宽度本来就是这个 1200，高度却只到 640，比例 1.875 而默认开窗
 * 是 1.2——高那条边能一路拖到只剩宽的一半，窗口被压成一条扁带：详情页只剩三行
 * 可见，设置页要切掉整整一组。收到 800 之后比例是 1.5，窗口在两个方向上都能
 * 均匀地缩。
 *
 * 代价是最小高度 800 装不进 768 高的屏幕（减去菜单栏 25 / 任务栏 40 约 728）。
 * 这是取舍：那类屏幕已经少见于桌面应用，而放不下时只是窗口顶满、内部滚动，
 * 不至于不能用；反过来，把下限压到能迁就它，就会在大屏上留下一条扁窗口。
 *
 * 必须与 src-tauri/tauri.conf.json、src-tauri/tauri.macos.conf.json 里的
 * minWidth / minHeight 保持一致：那两个是 OS 层的约束，这里在启动时再补一次
 * （恢复上次窗口尺寸时可能小于最小值）。两边对不上就会出现"能拖得更小"的窗口。
 */
export const WINDOW_MIN_WIDTH = 1200;
export const WINDOW_MIN_HEIGHT = 800;

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

/* ---------- 沉浸页 ---------- */ /**
 * 底部控制条闲置多久后淡出（ms）。
 *
 * 控制条默认可见、闲置才隐藏，方向不能反过来：默认藏起来的话，进沉浸页的
 * 第一眼没有任何播放控件，触屏上更是永远拿不到。取值参考视频播放器与
 * Apple Music 的全屏播放器：3 秒左右足够看清控制条在哪，又不至于长期占着画面。
 */
export const IMMERSIVE_CONTROLS_IDLE_MS = 3000;

/* ---------- 歌词 ---------- */
/** 每次调整的偏移步长（ms）：0.5s 是听感上能分辨、又不至于反复点的粒度 */
export const LYRICS_OFFSET_STEP_MS = 500;
/** 偏移上限（ms）：±10s 足够覆盖常见的音源/歌词错位，再大说明该换歌词源 */
export const LYRICS_OFFSET_MAX_MS = 10_000;

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

/* ---------- 在线详情缓存 ---------- */
/**
 * 详情接口（专辑/歌单/歌手/榜单/歌词）的内存缓存时长。
 *
 * 这些数据在几分钟内不会变，而用户经常专辑页↔歌手页↔歌单页来回走；
 * 取 5 分钟：既覆盖「退出去又进来」的典型路径，又不至于让歌单曲目更新
 * 长时间不可见。失败不写入缓存，重试仍会真正发请求。
 */
export const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
/** 详情缓存条数上限（按 LRU 淘汰） */
export const DETAIL_CACHE_MAX_ENTRIES = 80;

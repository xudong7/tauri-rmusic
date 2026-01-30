/** 默认封面图路径 */
export const DEFAULT_COVER_URL = "/icon-new.jpg";

/** 列表行高（与 CSS .list-row min-height + margin-bottom 一致），用于虚拟滚动计算 */
export const LIST_ROW_HEIGHT = 64;

/** 超过该数量时启用虚拟滚动，避免大量 DOM 导致卡顿 */
export const VIRTUAL_LIST_THRESHOLD = 20;

/** 虚拟滚动预渲染条数（可视区上下各多渲染，减少快速滚动空白） */
export const VIRTUAL_LIST_OVERSCAN = 10;

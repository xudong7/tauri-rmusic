/** 封面实体类型。取值需是 CoverImage 的 variant 子集，卡片直接透传。 */
export type EntityKind = "playlist" | "album" | "artist";

export interface EntityCardModel {
  /** v-for :key，同时用于点击回查原始数组（配合 sourceIndex 语义） */
  key: string;
  kind: EntityKind;
  title: string;
  /** 副标题：专辑/歌手的艺术家名，歌单的创建者 */
  subtitle?: string;
  /**
   * 预格式化的元信息，如「412 首」「12.3 万次播放」。
   * 刻意由视图格式化后再传入：数字与日期的本地化不该放进哑组件。
   */
  metaLabel?: string;
  coverUrl: string;
  /** 角标，如榜单的「刚刚更新」 */
  badge?: string;
  disabled?: boolean;
}

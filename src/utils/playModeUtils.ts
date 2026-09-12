import { Refresh, RefreshRight, Sort } from "@element-plus/icons-vue";
import { PlayMode } from "@/types/model";

/**
 * 播放模式的图标与文案键。
 *
 * 播放栏和沉浸页都要用同一套映射，所以抽到这里而不是各写一份 switch——
 * 本项目已经吃过一次「同一份列表写三遍」的亏（主题模式列表在 themeStore、
 * SettingsWindow、useStorageThemeSync 里各有一份，漏改一处会静默失效）。
 */

export const PLAY_MODE_SEQUENCE: readonly PlayMode[] = [
  PlayMode.SEQUENTIAL,
  PlayMode.RANDOM,
  PlayMode.REPEAT_ONE,
];

export function playModeIcon(mode: PlayMode | undefined) {
  switch (mode) {
    case PlayMode.REPEAT_ONE:
      return RefreshRight;
    case PlayMode.RANDOM:
      return Refresh;
    default:
      return Sort;
  }
}

export function playModeLabelKey(mode: PlayMode | undefined): string {
  switch (mode) {
    case PlayMode.REPEAT_ONE:
      return "playerBar.repeatOne";
    case PlayMode.RANDOM:
      return "playerBar.random";
    default:
      return "playerBar.sequential";
  }
}

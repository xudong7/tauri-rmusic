import type { MediaMetadataUpdate, TrayLabels } from "../types";
import { invokeCommand } from "../client";

export async function quitApp(): Promise<void> {
  await invokeCommand("quit_app");
}

/**
 * 通知后端「前端首帧已经画好」。
 *
 * 主窗口建窗时是隐藏的：后端在「sidecar 就绪」或「2s 预算用尽」时显示它。
 * 前端挂载完成意味着本地界面已经可用，没必要为了在线服务把窗口多压近 2s。
 * 幂等：后端已经显示过、或稍后再被预热路径调用，都不会有副作用。
 */
export async function revealMainWindow(): Promise<void> {
  await invokeCommand("reveal_main_window");
}

/** 打开/关闭桌面歌词悬浮窗。后端幂等：已存在则显示/关闭，不存在且 open=false 时为 no-op。 */
export async function setLyricsWindow(args: { open: boolean }): Promise<void> {
  await invokeCommand("set_lyrics_window", args);
}

/** 把当前曲目与播放状态推给系统媒体控制（macOS Now Playing / Windows SMTC / MPRIS） */
export async function updateMediaMetadata(args: {
  payload: MediaMetadataUpdate;
}): Promise<void> {
  await invokeCommand("update_media_metadata", args);
}

/** 更新托盘菜单语言与 tooltip（显示当前曲目） */
export async function updateTrayMenu(args: {
  labels: TrayLabels;
  nowPlaying: string | null;
}): Promise<void> {
  await invokeCommand("update_tray_menu", args);
}

/** 同步播放状态：切换菜单栏里「播放/暂停」图标并更新它的 tooltip */
export async function updateTrayPlaybackState(args: {
  playing: boolean;
  tooltip: string | null;
}): Promise<void> {
  await invokeCommand("update_tray_playback_state", args);
}

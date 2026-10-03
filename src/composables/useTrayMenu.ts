import { watch } from "vue";
import { useI18n } from "vue-i18n";
import { updateTrayMenu, updateTrayPlaybackState } from "@/api/commands/system";
import { usePlayerStore } from "@/stores/playerStore";

/**
 * 把托盘菜单文案与「正在播放」推给 Rust。
 *
 * 语言状态活在前端，菜单文案不写死在 Rust 里——否则两端各维护一份翻译。
 * 语言切换、曲目变化时各推一次；失败只警告，托盘不可用不该影响播放。
 */
export function useTrayMenu() {
  const { t, locale } = useI18n();
  const playerStore = usePlayerStore();

  function push() {
    const info = playerStore.currentTrackInfo;
    const nowPlaying = info ? `${info.name} — ${info.artist}`.trim() : null;

    void updateTrayMenu({
      labels: {
        play: t("tray.play"),
        pause: t("tray.pause"),
        previous: t("tray.previous"),
        next: t("tray.next"),
        quit: t("tray.quit"),
      },
      nowPlaying,
    }).catch((error) => {
      console.warn("[托盘] 更新菜单失败:", error);
    });
  }

  /** 菜单栏控制图标：中间那个要在播放/暂停之间切换，tooltip 也跟着语言走 */
  function pushPlaybackState() {
    void updateTrayPlaybackState({
      playing: playerStore.isPlaying,
      tooltip: playerStore.isPlaying ? t("tray.pause") : t("tray.play"),
    }).catch((error) => {
      console.warn("[托盘] 更新播放状态失败:", error);
    });
  }

  watch([() => locale.value, () => playerStore.currentTrackInfo], () => push(), {
    immediate: true,
  });

  watch([() => locale.value, () => playerStore.isPlaying], () => pushPlaybackState(), {
    immediate: true,
  });
}

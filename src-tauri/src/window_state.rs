//! 主窗口「什么时候出现」的唯一决策点。
//!
//! 不变量：主窗口在两个 tauri conf 里都是 `"visible": false`（建窗即隐藏），
//! 并且只有 [`reveal_main_window`] 会让它出现。
//!
//! 两半必须住在一起，因为它们是同一个不变量的两半：改了一半忘了另一半，窗口
//! 就会在服务就绪之前冒出来，或者干脆永远不出现。
//!
//! 为什么窗口要压着不出：sidecar 是 Node 进程，实测冷启动 4.68s、热启动 1.7s。
//! 应用启动时并行预热它，并把窗口的显示推迟到服务就绪——这样窗口出现时在线功能
//! 就是可用的，而不是让用户在已经打开的界面里干等。

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/// window-state 保存/恢复使用的标志：除 `VISIBLE` 外全要。
///
/// 排除 `VISIBLE` 一次解决两件事：
/// - 恢复时插件不再自己 `show()`。插件在 `on_window_ready` 里会用它自己的
///   `state_flags` 自动恢复一次，而 `restore_state` 的结尾是
///   `if flags.contains(VISIBLE) && should_show { self.show()?; self.set_focus()?; }`
///   ——默认的 `all()` 会让窗口在建窗那一刻就显示出来，预热也就白做了。
/// - 保存时不会把 `visible: false` 写进 `.window-state.json`，于是「上次退出时
///   窗口是隐藏的」不会变成「下次启动窗口永远不出现」。
///
/// 位置、尺寸、最大化、全屏、装饰这几项的恢复都不受影响。
pub(crate) fn restore_flags() -> StateFlags {
    StateFlags::all().difference(StateFlags::VISIBLE)
}

/// 显示主窗口并交给它焦点。幂等：已经可见时什么都不做，因此预热超时、托盘菜单、
/// 单实例回调、macOS 的 Reopen 这些路径都可以安全地调用它。
///
/// 返回是否真的显示了一次，供调用方决定要不要记一笔。
pub(crate) fn reveal_main_window(app: &tauri::AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("Main window not found, cannot reveal it");
        return false;
    };

    // 读不到可见状态时按「不可见」处理：多显示一次是安全的，少显示一次会让应用
    // 看起来根本没启动
    if window.is_visible().unwrap_or(false) {
        return false;
    }

    if let Err(e) = window.show() {
        eprintln!("Failed to show main window: {}", e);
        return false;
    }

    // 必须排在 show() 之后：tao 的 macOS set_focus 在窗口不可见时直接返回
    // （platform_impl/macos/window.rs 里那句 `if !is_minimized && is_visible`），
    // 先 focus 等于没调用。窗口消息按 FIFO 在主线程执行，所以这个顺序成立。
    if let Err(e) = window.set_focus() {
        eprintln!("Failed to focus main window: {}", e);
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_flags_exclude_visible() {
        // 整个「窗口等服务就绪再出现」的设计都压在这一行上：带上 VISIBLE，
        // 插件会在建窗时就把窗口显示出来，预热与推迟显示全部失效
        assert!(!restore_flags().contains(StateFlags::VISIBLE));
    }

    #[test]
    fn restore_flags_keep_position_size_and_the_rest() {
        // 防的是「以后有人顺手收紧这几个标志」：少一个都不会编译失败，只会让
        // 窗口位置或尺寸在某次启动后不再恢复，而且很难归因到这里
        let flags = restore_flags();
        for kept in [
            StateFlags::POSITION,
            StateFlags::SIZE,
            StateFlags::MAXIMIZED,
            StateFlags::FULLSCREEN,
            StateFlags::DECORATIONS,
        ] {
            assert!(flags.contains(kept), "不该丢掉 {:?}", kept);
        }
    }

    /// 两个 conf 缺一不可：平台配置的 `app.windows` 数组会**整体替换** base 的
    /// 那一份（RFC 7396 合并补丁，数组不做按 label 的合并），所以只改 base 等于
    /// 在 macOS 上没改——而 macOS 正是这个功能的主要目标平台。这条在编译期看不
    /// 出来，只有真跑起来才会发现窗口提前出现，所以从源码层面钉住。
    #[test]
    fn both_window_configs_start_hidden() {
        for (name, source) in [
            ("tauri.conf.json", include_str!("../tauri.conf.json")),
            (
                "tauri.macos.conf.json",
                include_str!("../tauri.macos.conf.json"),
            ),
        ] {
            let config: serde_json::Value = serde_json::from_str(source)
                .unwrap_or_else(|e| panic!("{} 不是合法 JSON: {}", name, e));
            let window = &config["app"]["windows"][0];

            assert_eq!(
                window["visible"], false,
                "{} 里的主窗口必须是建窗即隐藏",
                name
            );
            assert_eq!(window["label"], "main", "{} 的窗口标签变了", name);
        }
    }
}

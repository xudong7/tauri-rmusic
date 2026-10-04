//! 迷你播放器窗口。
//!
//! 独立 webview 窗口（label = "mini-player"），无边框、透明、置顶、固定尺寸；
//! 前端入口在 main.ts 按窗口 label 选择 MiniPlayer 组件渲染。
//!
//! 主窗才是播放状态的唯一持有者（队列、歌单、本地曲库都只存在于那边），
//! mini 窗只接收 `mini-player-state` 快照、回抛 `mini-player-action` 指令。
//! 进度不走主窗推送：主窗隐藏后它的播放时钟停在 document.hidden 上，
//! 由 mini 窗自己轮询 get_playback_state 并本地外推（同桌面歌词）。
//!
//! 窗口位置不需要在这里持久化：window-state 插件对每个窗口都会自动
//! save（Moved/Exit）与 restore（on_window_ready），这里只管首次打开的落点。

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const MINI_PLAYER_WINDOW_LABEL: &str = "mini-player";

/// 窗口比迷你条本体四周各多 8px：给 CSS 投影和圆角留出透明边距。
/// 宽度所有状态共用——改宽度等于改文字的排版基线，两边都得动。
/// 340 是「播放控制不显得孤零零挂在左边」的上限：再宽，控制区与右侧图标之间
/// 就会空出一大块。
const WINDOW_WIDTH: f64 = 340.0;
/// 收起态：8 + 60 + 8
const WINDOW_HEIGHT: f64 = 76.0;
/// 展开封面大图：8 + 324(1:1 大图，宽 = 340 - 两侧各 8) + 60(迷你条) + 8。
/// 大图与迷你条无缝拼接（没有间隙），所以是「上下边距 + 大图 + 迷你条」。
const WINDOW_COVER_HEIGHT: f64 = 400.0;
/// 展开播放队列：8 + 400(队列面板) + 60(迷你条) + 8
const WINDOW_QUEUE_HEIGHT: f64 = 476.0;
const SCREEN_MARGIN: f64 = 32.0;

/// 迷你条上方展开的面板。尺寸由面板类型决定，前端只报类型。
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MiniPlayerPanel {
    None,
    Cover,
    Queue,
}

impl MiniPlayerPanel {
    fn height(self) -> f64 {
        match self {
            Self::None => WINDOW_HEIGHT,
            Self::Cover => WINDOW_COVER_HEIGHT,
            Self::Queue => WINDOW_QUEUE_HEIGHT,
        }
    }
}

/// 打开或关闭迷你播放器窗。命令幂等：重复打开只 show，不存在时关闭是空操作。
///
/// `panel` 只在建窗时用：前端从 localStorage 读出上次展开的面板，直接按目标
/// 尺寸建窗，避免「先按收起态建出来、再撑开」闪一下。
#[tauri::command]
pub async fn set_mini_player_window(
    app_handle: AppHandle,
    open: bool,
    panel: Option<MiniPlayerPanel>,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(MINI_PLAYER_WINDOW_LABEL) {
        if open {
            window
                .show()
                .map_err(|e| format!("show mini player window: {}", e))?;
            if window.is_minimized().unwrap_or(false) {
                window
                    .unminimize()
                    .map_err(|e| format!("unminimize mini player window: {}", e))?;
            }
            window
                .set_focus()
                .map_err(|e| format!("focus mini player window: {}", e))?;
        } else {
            window
                .close()
                .map_err(|e| format!("close mini player window: {}", e))?;
        }
        return Ok(());
    }

    if !open {
        return Ok(());
    }

    let height = panel.unwrap_or(MiniPlayerPanel::None).height();

    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        MINI_PLAYER_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Rmusic Mini Player")
    .inner_size(WINDOW_WIDTH, height)
    // 固定尺寸 + 不可最大化：迷你条被拖大只会露出透明底色，没有意义。
    // 双击拖拽区在 macOS 上会触发 zoom，所以 maximizable 也要关。
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .shadow(false)
    // 先不显示：window-state 插件会在建窗回调里按磁盘记录恢复尺寸，等下面校准
    // 完再 show，避免窗口以旧尺寸闪一帧
    .visible(false);

    if let Some((x, y)) = initial_position(&app_handle) {
        builder = builder.position(x, y);
    }

    let window = builder
        .build()
        .map_err(|e| format!("create mini player window: {}", e))?;

    // 插件恢复的尺寸可能是旧版本常量留下的记录（宽度/高度都对不上，前端按新
    // 常量排版就会和窗口错位）。插件的恢复在 window_created 回调里同步执行，
    // 早于这里排队的消息，所以这一句能稳稳覆盖它；位置不碰，留给插件恢复。
    window
        .set_size(LogicalSize::new(WINDOW_WIDTH, height))
        .map_err(|e| format!("size mini player window: {}", e))?;
    window
        .show()
        .map_err(|e| format!("show mini player window: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("focus mini player window: {}", e))?;

    Ok(())
}

/// 切换迷你条上方展开的面板（无 / 封面大图 / 播放队列）。
///
/// 只 resize 会让窗口向屏幕下方长（以左上角为锚），默认就停在屏幕右下角的
/// 迷你条会直接跑出可视区，所以这里把底边钉住。两件事走同一个命令而不是两次
/// 前端窗口 API 调用：尺寸与移位要在同一轮事件循环里连续下发，否则窗口会先
/// 向下长、再跳回来，肉眼能看到抖一下。
#[tauri::command]
pub async fn set_mini_player_panel(
    app_handle: AppHandle,
    panel: MiniPlayerPanel,
) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window(MINI_PLAYER_WINDOW_LABEL) else {
        return Err("mini player window not found".to_string());
    };

    let scale = window
        .scale_factor()
        .map_err(|e| format!("read mini player scale factor: {}", e))?;
    let size = window
        .outer_size()
        .map_err(|e| format!("read mini player size: {}", e))?
        .to_logical::<f64>(scale);
    let position = window
        .outer_position()
        .map_err(|e| format!("read mini player position: {}", e))?
        .to_logical::<f64>(scale);

    // 窗口上方还有多少空间：不够就改为向下展开（见 target_vertical）。
    // 拿不到显示器信息时按无限空间处理，退回默认的向上展开
    let room_above = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            position.y
                - monitor
                    .position()
                    .to_logical::<f64>(monitor.scale_factor())
                    .y
        })
        .unwrap_or(f64::INFINITY);

    let (height, y) = target_vertical(position.y, size.height, panel.height(), room_above);
    // 尺寸已经对了就什么都不做：挂载时同步、重复点击都会走到这里
    if (size.height - height).abs() < 0.5 {
        return Ok(());
    }

    // 改尺寸与移位必须落在同一个主线程任务里。分开排队会各占一轮事件循环，
    // 中间渲染出一帧「新尺寸 + 旧位置」的窗口：收起时表现为底部闪过一块白
    // （卡片底色），展开时表现为窗口先向下长再跳回去。主线程上这两个 setter
    // 会同步执行（send_user_message 的主线程快路径），于是只渲染最终状态。
    let window_for_task = window.clone();
    window
        .run_on_main_thread(move || {
            if let Err(e) = window_for_task.set_size(LogicalSize::new(WINDOW_WIDTH, height)) {
                eprintln!("Failed to resize mini player window: {}", e);
            }
            if let Err(e) = window_for_task.set_position(LogicalPosition::new(position.x, y)) {
                eprintln!("Failed to move mini player window: {}", e);
            }
        })
        .map_err(|e| format!("resize mini player window on main thread: {}", e))?;

    Ok(())
}

/// 目标高度与纵向位置：默认按「底边不动」把窗口向上长 / 向下缩。
///
/// 例外是上方空间不足（用户把迷你条拖到了屏幕顶部）：继续向上长会把大图顶出
/// 屏幕，只剩一条迷你条浮在顶上，看起来像坏了。此时改为顶边不动、向下展开。
fn target_vertical(
    current_y: f64,
    current_height: f64,
    height: f64,
    room_above: f64,
) -> (f64, f64) {
    let delta = height - current_height;
    if delta > 0.0 && delta > room_above {
        return (height, current_y);
    }
    (height, current_y - delta)
}

/// 首次打开时的落点：主显示器右下角，留出边距。
///
/// 之后的打开由 window-state 插件恢复用户拖过的位置，不会回到这里。
/// 取不到显示器（无头环境/权限异常）时返回 None，交给平台默认落点。
fn initial_position(app: &AppHandle) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    Some((
        origin.x + size.width - WINDOW_WIDTH - SCREEN_MARGIN,
        origin.y + size.height - WINDOW_HEIGHT - SCREEN_MARGIN,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expanding_keeps_the_bottom_edge_anchored() {
        // 屏幕底部附近的窗口：展开时底边必须留在原处，否则会掉出可视区
        let expanded_height = MiniPlayerPanel::Cover.height();
        let (height, expanded_y) =
            target_vertical(800.0, WINDOW_HEIGHT, expanded_height, f64::INFINITY);
        assert_eq!(height, expanded_height);
        assert_eq!(expanded_y + height, 800.0 + WINDOW_HEIGHT);

        // 收起是展开的逆操作：回到原来的 y 与高度
        let (collapsed_height, collapsed_y) =
            target_vertical(expanded_y, height, WINDOW_HEIGHT, f64::INFINITY);
        assert_eq!(collapsed_height, WINDOW_HEIGHT);
        assert_eq!(collapsed_y, 800.0);
    }

    #[test]
    fn expanding_flips_downwards_when_there_is_no_room_above() {
        let target = MiniPlayerPanel::Queue.height();

        // 贴屏幕顶部：向上展开会让面板跑到屏幕外，改为顶边不动、向下展开
        let (height, y) = target_vertical(0.0, WINDOW_HEIGHT, target, 0.0);
        assert_eq!(height, target);
        assert_eq!(y, 0.0);

        // 上方空间刚好够（等于增量）时仍走底边锚定
        let delta = target - WINDOW_HEIGHT;
        let (_, y) = target_vertical(400.0, WINDOW_HEIGHT, target, delta);
        assert_eq!(y, 400.0 - delta);
    }

    #[test]
    fn panels_have_distinct_heights() {
        // 三个面板高度必须区分开，否则前端切换面板时窗口不动，看起来像没反应
        let none = MiniPlayerPanel::None.height();
        let cover = MiniPlayerPanel::Cover.height();
        let queue = MiniPlayerPanel::Queue.height();
        assert_eq!(none, WINDOW_HEIGHT);
        assert!(cover > none, "封面面板要比收起态高");
        assert!(queue > cover, "队列面板要比封面面板高");
    }

    /// 动态建的窗口不会自动获得能力（capability）：`default.json` 的 windows
    /// 数组漏了这个 label，mini 窗里所有 Tauri 调用都会被 ACL 拒绝，而报错
    /// 只会出现在运行时、且看不出根因。从源码层面钉住。
    #[test]
    fn window_label_is_declared_in_default_capability() {
        let source = include_str!("../capabilities/default.json");
        let config: serde_json::Value =
            serde_json::from_str(source).expect("capabilities/default.json 不是合法 JSON");
        let labels = config["windows"]
            .as_array()
            .expect("capabilities/default.json 缺少 windows 数组");

        assert!(
            labels
                .iter()
                .any(|label| label.as_str() == Some(MINI_PLAYER_WINDOW_LABEL)),
            "capabilities/default.json 的 windows 里必须有 {}",
            MINI_PLAYER_WINDOW_LABEL
        );
    }
}

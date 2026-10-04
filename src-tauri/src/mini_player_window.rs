//! 迷你播放器窗口。
//!
//! 独立 webview 窗口（label = "mini-player"），无边框、透明、置顶、固定宽度；
//! 前端入口在 main.ts 按窗口 label 选择 MiniPlayer 组件渲染。
//!
//! 主窗才是播放状态的唯一持有者（队列、歌单、本地曲库都只存在于那边），
//! mini 窗只接收 `mini-player-state` / `mini-player-queue` 快照、回抛
//! `mini-player-action` 指令。进度不走主窗推送：主窗隐藏后它的播放时钟停在
//! document.hidden 上，由 mini 窗自己轮询 get_playback_state 并本地外推。
//!
//! 窗口布局：迷你条固定宽度，封面面板长在条的上方、队列面板长在条的下方，
//! 两者可以同时展开。展开/收起时以「迷你条在屏幕上的位置不动」为锚点，
//! 超出显示器时整体平移回可视区。
//!
//! 窗口位置不需要在这里持久化：window-state 插件对每个窗口都会自动
//! save（Moved/Exit）与 restore（on_window_ready），这里只管首次打开的落点。

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const MINI_PLAYER_WINDOW_LABEL: &str = "mini-player";

/// 窗口比迷你条本体左右各多 8px：给 CSS 投影和圆角留出透明边距。
/// 宽度所有状态共用——改宽度等于改文字的排版基线，两边都得动。
/// 340 是「播放控制不显得孤零零挂在左边」的上限：再宽，控制区与右侧图标之间
/// 就会空出一大块。
const WINDOW_WIDTH: f64 = 340.0;
/// 卡片四周的透明内边距（上下同样各 8px）
const WINDOW_PADDING: f64 = 8.0;
/// 迷你条本体高度
const BAR_HEIGHT: f64 = 60.0;
/// 封面面板高度：宽 340 - 两侧各 8 = 324，1:1 正方形
const COVER_PANEL_HEIGHT: f64 = 324.0;
/// 队列面板高度：约 6 行 + 表头
const QUEUE_PANEL_HEIGHT: f64 = 400.0;
/// 首次打开的落点距屏幕上/右边缘的距离
const SCREEN_MARGIN: f64 = 32.0;

/// 迷你条上下两个面板的开合状态。窗口尺寸完全由它决定。
#[derive(Clone, Copy, Debug, Default, PartialEq, serde::Deserialize)]
pub struct MiniPlayerLayout {
    /// 封面大图（迷你条上方）
    pub cover: bool,
    /// 播放队列（迷你条下方）
    pub queue: bool,
}

impl MiniPlayerLayout {
    fn cover_height(self) -> f64 {
        if self.cover {
            COVER_PANEL_HEIGHT
        } else {
            0.0
        }
    }

    fn queue_height(self) -> f64 {
        if self.queue {
            QUEUE_PANEL_HEIGHT
        } else {
            0.0
        }
    }

    /// 窗口总高度 = 上下边距 + 封面 + 迷你条 + 队列
    fn window_height(self) -> f64 {
        WINDOW_PADDING * 2.0 + self.cover_height() + BAR_HEIGHT + self.queue_height()
    }

    /// 迷你条上沿距窗口顶部的距离。展开/收起时靠它把条钉在屏幕原处。
    fn bar_offset(self) -> f64 {
        WINDOW_PADDING + self.cover_height()
    }
}

/// 当前窗口几何对应的布局。命令本身幂等，但换算新位置需要知道「旧的条在哪」，
/// 所以把上一次的布局记在应用状态里。
#[derive(Default)]
pub struct MiniPlayerLayoutState(std::sync::Mutex<MiniPlayerLayout>);

/// 打开或关闭迷你播放器窗。命令幂等：重复打开只 show，不存在时关闭是空操作。
///
/// `layout` 只在建窗时用：前端从 localStorage 读出上次的面板开合，直接按目标
/// 尺寸建窗，避免「先按收起态建出来、再撑开」闪一下。
#[tauri::command]
pub async fn set_mini_player_window(
    app_handle: AppHandle,
    open: bool,
    layout: Option<MiniPlayerLayout>,
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

    let layout = layout.unwrap_or_default();
    let height = layout.window_height();

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

    set_layout_state(&app_handle, layout);

    Ok(())
}

/// 切换迷你条上下的面板（封面 / 队列，可同时展开）。
///
/// 锚点是迷你条本身：封面展开时窗口向上长、队列展开时向下长，条在屏幕上的
/// 位置不动；长到超出显示器时整体平移回可视区（贴边）。改尺寸与移位必须落在
/// 同一个主线程任务里，否则中间会渲染一帧「新尺寸 + 旧位置」的窗口。
#[tauri::command]
pub async fn set_mini_player_layout(
    app_handle: AppHandle,
    layout: MiniPlayerLayout,
) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window(MINI_PLAYER_WINDOW_LABEL) else {
        return Err("mini player window not found".to_string());
    };

    let previous = take_layout_state(&app_handle, layout)?;
    if previous == layout {
        return Ok(());
    }

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

    let (height, y) = layout_geometry(previous, layout, position.y, vertical_bounds(&window));
    // 尺寸和位置都已经对了就什么都不做（挂载时同步、重复点击都会走到这里）
    if (size.height - height).abs() < 0.5 && (position.y - y).abs() < 0.5 {
        return Ok(());
    }

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

/// 目标窗口高度与纵向位置。
///
/// 默认把迷你条钉在原处：窗口顶 = 旧顶 + 旧条偏移 - 新条偏移。
/// 结果超出显示器时整体平移回可视区（先贴底、再贴顶），保证内容可见。
fn layout_geometry(
    previous: MiniPlayerLayout,
    next: MiniPlayerLayout,
    current_y: f64,
    bounds: Option<(f64, f64)>,
) -> (f64, f64) {
    let height = next.window_height();
    let mut y = current_y + previous.bar_offset() - next.bar_offset();
    if let Some((top, bottom)) = bounds {
        if y + height > bottom {
            y = bottom - height;
        }
        if y < top {
            y = top;
        }
    }
    (height, y)
}

/// 当前显示器可视区的上下边界（逻辑像素）。取不到时返回 None，退化为不夹取。
fn vertical_bounds(window: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    let monitor = window.current_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let top = monitor.position().to_logical::<f64>(scale).y;
    let height = monitor.size().to_logical::<f64>(scale).height;
    Some((top, top + height))
}

fn set_layout_state(app_handle: &AppHandle, layout: MiniPlayerLayout) {
    if let Some(state) = app_handle.try_state::<MiniPlayerLayoutState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = layout;
        }
    }
}

/// 读出旧布局并写入新布局。锁只在这一小段里持有，命令后续还有 await，
/// 不能用 std 的 guard 跨 await。
fn take_layout_state(
    app_handle: &AppHandle,
    next: MiniPlayerLayout,
) -> Result<MiniPlayerLayout, String> {
    let Some(state) = app_handle.try_state::<MiniPlayerLayoutState>() else {
        return Ok(next);
    };
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "mini player layout lock poisoned".to_string())?;
    let previous = *guard;
    *guard = next;
    Ok(previous)
}

/// 首次打开时的落点：主显示器右上角，留出边距。
///
/// 队列面板向下展开，所以默认停在顶部——这样队列一打开就能完整显示；
/// 封面向上展开时若顶不下，会被夹取逻辑整体下移（与参考图一致）。
/// 之后的打开由 window-state 插件恢复用户拖过的位置，不会回到这里。
fn initial_position(app: &AppHandle) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    Some((
        origin.x + size.width - WINDOW_WIDTH - SCREEN_MARGIN,
        origin.y + SCREEN_MARGIN,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: MiniPlayerLayout = MiniPlayerLayout {
        cover: false,
        queue: false,
    };
    const COVER: MiniPlayerLayout = MiniPlayerLayout {
        cover: true,
        queue: false,
    };
    const QUEUE: MiniPlayerLayout = MiniPlayerLayout {
        cover: false,
        queue: true,
    };

    #[test]
    fn bar_stays_put_when_panels_toggle() {
        // 队列向下长：窗口顶不动，条的位置就不动
        let (height, y) = layout_geometry(NONE, QUEUE, 32.0, None);
        assert_eq!(height, NONE.window_height() + QUEUE_PANEL_HEIGHT);
        assert_eq!(y, 32.0);

        // 封面向上长：窗口顶整体上移一个封面的高度，条仍不动
        let (height, y) = layout_geometry(NONE, COVER, 400.0, None);
        assert_eq!(height, NONE.window_height() + COVER_PANEL_HEIGHT);
        assert_eq!(y + COVER_PANEL_HEIGHT, 400.0);
    }

    #[test]
    fn window_is_clamped_into_the_monitor() {
        // 贴屏幕顶部开封面：上面装不下，整体下移到贴顶
        let (_, y) = layout_geometry(NONE, COVER, 0.0, Some((0.0, 900.0)));
        assert_eq!(y, 0.0);

        // 贴屏幕底部开队列：下面装不下，整体上移到贴底
        let (height, y) = layout_geometry(NONE, QUEUE, 800.0, Some((0.0, 900.0)));
        assert_eq!(y + height, 900.0);
    }

    #[test]
    fn both_panels_stack_around_the_bar() {
        let both = MiniPlayerLayout {
            cover: true,
            queue: true,
        };
        assert_eq!(
            both.window_height(),
            WINDOW_PADDING * 2.0 + COVER_PANEL_HEIGHT + BAR_HEIGHT + QUEUE_PANEL_HEIGHT
        );
        // 条的上沿在封面之下：封面 + 队列同开时条不会被队列挤走
        assert_eq!(both.bar_offset(), WINDOW_PADDING + COVER_PANEL_HEIGHT);
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

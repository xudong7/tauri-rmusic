use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// 等待 sidecar 就绪的总预算。它是给「进程起得来、服务却始终不健康」兜底的，
/// 不是正常路径的耗时上限。
const READY_TIMEOUT: Duration = Duration::from_secs(10);

/// 通用轮询阶梯。冷启动期间立即发出的搜索请求会撞上尚未监听的端口，所以这里
/// 退避着探活；阶数走完后按最后一档的间隔一直试到 [`READY_TIMEOUT`]。
const RETRY_DELAYS: [Duration; 5] = [
    Duration::from_millis(120),
    Duration::from_millis(200),
    Duration::from_millis(350),
    Duration::from_millis(500),
    Duration::from_millis(700),
];

/// 预热专用阶梯，只用在启动预热这一条路径上。
///
/// 通用阶梯对这里太粗了：它最大间隔 700ms，采样点落在 t ≈ 0.12 / 0.32 / 0.67 /
/// 1.17 / 1.87 / 2.58……而实测热启动约 1.7s、预热预算 2s——服务在 1.7s 就绪，
/// 却要等到 1.87s 才被发现；一旦实际耗时偏到 1.9s，下一次采样已经越过预算，
/// 窗口反而要带着「连接中」的指示灯出现。把阶梯加密到最大 150ms，发现延迟就
/// 远小于预算了。多出来的请求只是本机环回上的十来个 GET，可以忽略。
const PREWARM_RETRY_DELAYS: [Duration; 6] = [
    Duration::from_millis(60),
    Duration::from_millis(80),
    Duration::from_millis(100),
    Duration::from_millis(120),
    Duration::from_millis(150),
    Duration::from_millis(150),
];

/// 主窗口最多被压住多久不出。
///
/// 实测 sidecar 冷启动 4.68s、热启动 1.7s（仓库里那份真实二进制，轮询
/// `/login/status`）。预算取 2s：热启动时窗口出现那一刻服务已经可用；冷启动时
/// 窗口在 2s 时先出现，剩下的等待交给顶栏那颗状态灯。上限的意义在于——无论
/// 服务最后能不能起来，窗口都必须出现，绝不能把应用卡成一个不露面的进程。
pub(crate) const PREWARM_MAX_WAIT: Duration = Duration::from_secs(2);

#[derive(Clone, Default)]
pub struct OnlineServiceProcess {
    child: Arc<Mutex<Option<CommandChild>>>,
}

/// 返回当前平台的 sidecar 名称（与 build.rs / lib.rs 中使用的名称一致）
pub fn sidecar_name_for_current_platform() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "app_linux"
    }
    #[cfg(target_os = "macos")]
    {
        "app_mac"
    }
    #[cfg(target_os = "windows")]
    {
        "app_win"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "app"
    }
}

/// set up the service for the sidecar
#[tauri::command]
pub async fn ensure_online_service(
    app_handle: tauri::AppHandle,
    process: tauri::State<'_, OnlineServiceProcess>,
) -> Result<(), String> {
    let service_name = sidecar_name_for_current_platform();
    spawn_service(&app_handle, service_name, process.inner())?;
    wait_until_service_ready().await
}

/// Sidecar 进程创建成功不代表 HTTP 服务已经开始监听。这里用有上限的退避轮询
/// 建立真正的就绪屏障，避免冷启动期间立即发出的搜索请求撞上未监听端口。
async fn wait_until_service_ready() -> Result<(), String> {
    wait_until_service_ready_with(&RETRY_DELAYS, READY_TIMEOUT).await
}

/// 就绪等待的本体。阶梯与预算由调用方给定——预热有自己的阶梯（见
/// [`PREWARM_RETRY_DELAYS`]），两条路径共用同一套轮询逻辑。
pub(crate) async fn wait_until_service_ready_with(
    ladder: &[Duration],
    timeout: Duration,
) -> Result<(), String> {
    let wait = async {
        let mut attempt = 0usize;
        loop {
            let status = crate::netease::check_online_service_status().await?;
            if status.available {
                return Ok(());
            }

            let delay = retry_delay(attempt, ladder);
            attempt += 1;
            tokio::time::sleep(delay).await;
        }
    };

    tokio::time::timeout(timeout, wait).await.map_err(|_| {
        format!(
            "Online service did not become ready within {}s",
            timeout.as_secs()
        )
    })?
}

/// 阶梯走完后保持最后一档，不越界。
///
/// 「越界即饱和」这条规则原本藏在 `attempt.min(len - 1)` 里，改阶梯时最容易在
/// 这里写错，所以单独抽出来测。空阶梯没有意义，但也不该 panic（release 下
/// panic = "abort"）：退回一个固定的小间隔，总比进程直接没了强。
pub(crate) fn retry_delay(attempt: usize, ladder: &[Duration]) -> Duration {
    match ladder.len() {
        0 => Duration::from_millis(200),
        len => ladder[attempt.min(len - 1)],
    }
}

/// 同步拉起 sidecar（[`spawn_service`] 幂等，已有子进程时直接返回）。
///
/// 与「等待就绪」分开是刻意的：等待要跟预算赛跑，而 [`with_deadline`] 的超时分支
/// 会把仍在等待的 future 直接 drop 掉。如果进程创建也写在那个 future 里，它到底
/// 有没有被执行就只是「select! 恰好先轮询了它一次」的巧合——async fn 的函数体在
/// 被轮询之前根本不运行，而 select! 是随机决定先轮询哪个分支的。零预算下这个巧合
/// 不成立：sidecar 永远不会被拉起，窗口却照样出现。提到赛跑之外，这件事就不再
/// 依赖任何时序巧合。
pub(crate) fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let process = app
        .try_state::<OnlineServiceProcess>()
        .ok_or_else(|| "OnlineServiceProcess is not managed".to_string())?;
    spawn_service(app, sidecar_name_for_current_platform(), process.inner())
}

/// 预热等待的主体。失败只打日志：此刻窗口可能已经显示（预算用完），预热本身也
/// 没有任何可回滚的动作，往上抛没有接收者。
pub(crate) async fn wait_for_prewarm() {
    if let Err(e) = wait_until_service_ready_with(&PREWARM_RETRY_DELAYS, READY_TIMEOUT).await {
        eprintln!("Online service did not become ready during prewarm: {}", e);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RevealCause {
    /// 服务在预算内就绪——窗口是「已经能用了」才出现的。
    Ready,
    /// 预算用尽——窗口先出现，余下的等待交给顶栏那颗状态灯。
    TimedOut,
}

/// 让「等待」与「显示窗口」互为上限：`wait` 先完成就立刻显示，预算先到就放弃
/// 等待并显示。`reveal` 恰好被调用一次，且总在 `wait` 定局之后。
///
/// 不写 `Send` 约束：真实调用点由 `tauri::async_runtime::spawn` 施加，测试里则可以
/// 用 `Rc`/`Cell` 记账（`#[tokio::test]` 默认是单线程运行时）。
pub(crate) async fn with_deadline<W, R>(wait: W, deadline: Duration, reveal: R) -> RevealCause
where
    W: Future<Output = ()>,
    R: FnOnce(),
{
    tokio::pin!(wait);
    let cause = tokio::select! {
        _ = &mut wait => RevealCause::Ready,
        _ = tokio::time::sleep(deadline) => RevealCause::TimedOut,
    };
    reveal();
    cause
}

fn spawn_service(
    app_handle: &tauri::AppHandle,
    service_name: &str,
    process: &OnlineServiceProcess,
) -> Result<(), String> {
    if process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .is_some()
    {
        return Ok(());
    }

    let app_sidecar_command = app_handle
        .shell()
        .sidecar(service_name)
        .map_err(|e| format!("Failed to get sidecar command for {}: {}", service_name, e))?;

    let (mut rx, child) = app_sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar {}: {}", service_name, e))?;
    let pid = child.pid();
    process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .replace(child);

    let child_state = Arc::clone(&process.child);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(_) = event {
                if let Ok(mut current) = child_state.lock() {
                    if current.as_ref().map(CommandChild::pid) == Some(pid) {
                        current.take();
                    }
                }
            }
        }
        if let Ok(mut current) = child_state.lock() {
            if current.as_ref().map(CommandChild::pid) == Some(pid) {
                current.take();
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn restart_online_service(
    app_handle: tauri::AppHandle,
    process: tauri::State<'_, OnlineServiceProcess>,
) -> Result<(), String> {
    let service_name = sidecar_name_for_current_platform();
    shutdown_service(process.inner())?;
    tokio::time::sleep(Duration::from_millis(300)).await;
    spawn_service(&app_handle, service_name, process.inner())?;
    wait_until_service_ready().await
}

/// shutdown the service for the sidecar
pub fn shutdown_service(process: &OnlineServiceProcess) -> Result<(), String> {
    let child = process
        .child
        .lock()
        .map_err(|_| "Online service process lock poisoned".to_string())?
        .take();
    if let Some(child) = child {
        child
            .kill()
            .map_err(|e| format!("Failed to terminate online service: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::rc::Rc;

    #[tokio::test]
    async fn with_deadline_reports_ready_and_reveals_when_wait_finishes_first() {
        let revealed = Rc::new(Cell::new(0));
        let counter = Rc::clone(&revealed);

        let cause = with_deadline(async {}, Duration::from_secs(5), move || {
            counter.set(counter.get() + 1);
        })
        .await;

        // 5 秒的 sleep 不可能在第一次轮询就就绪，所以走哪个分支是确定的
        assert_eq!(cause, RevealCause::Ready);
        assert_eq!(revealed.get(), 1);
    }

    #[tokio::test]
    async fn with_deadline_reports_timeout_and_still_reveals() {
        let revealed = Rc::new(Cell::new(0));
        let counter = Rc::clone(&revealed);

        let cause = with_deadline(
            std::future::pending::<()>(),
            Duration::from_millis(20),
            move || counter.set(counter.get() + 1),
        )
        .await;

        // 「预算用尽也必须显示窗口」是这套机制的全部意义。漏了它，服务起不来
        // 的时候应用就变成一个永远不露面的进程
        assert_eq!(cause, RevealCause::TimedOut);
        assert_eq!(revealed.get(), 1);
    }

    #[tokio::test]
    async fn with_deadline_drops_the_pending_wait_when_the_deadline_wins() {
        /// 析构时置位，用来证明等待 future 确实被丢掉了
        struct DropFlag(Rc<Cell<bool>>);
        impl Drop for DropFlag {
            fn drop(&mut self) {
                self.0.set(true);
            }
        }

        let dropped = Rc::new(Cell::new(false));
        let flag = DropFlag(Rc::clone(&dropped));

        with_deadline(
            async move {
                let _flag = flag;
                std::future::pending::<()>().await;
            },
            Duration::from_millis(20),
            || {},
        )
        .await;

        // 这条就是 start_sidecar 必须待在赛跑之外的原因：超时分支会把等待 future
        // 连同它捕获的一切直接 drop，写在里面的动作不保证被执行
        assert!(dropped.get());
    }

    #[tokio::test]
    async fn with_deadline_calls_reveal_after_the_wait_completes() {
        let ready = Rc::new(Cell::new(false));
        let wait_flag = Rc::clone(&ready);
        let reveal_flag = Rc::clone(&ready);

        with_deadline(
            async move { wait_flag.set(true) },
            Duration::from_secs(5),
            move || assert!(reveal_flag.get(), "reveal 必须排在 wait 定局之后"),
        )
        .await;
    }

    #[test]
    fn retry_delay_walks_the_ladder_and_saturates_at_the_last_rung() {
        let ladder = [
            Duration::from_millis(10),
            Duration::from_millis(20),
            Duration::from_millis(30),
        ];

        assert_eq!(retry_delay(0, &ladder), ladder[0]);
        assert_eq!(retry_delay(1, &ladder), ladder[1]);
        assert_eq!(retry_delay(2, &ladder), ladder[2]);
        assert_eq!(retry_delay(3, &ladder), ladder[2]);
        assert_eq!(retry_delay(usize::MAX, &ladder), ladder[2]);
    }

    #[test]
    fn retry_delay_survives_an_empty_ladder() {
        // 空阶梯是调用方的错误，但 release 下 panic = "abort"，不该由它把进程带走
        assert!(retry_delay(0, &[]) > Duration::ZERO);
    }

    #[test]
    fn prewarm_ladder_stays_dense_enough_for_the_budget() {
        // 阶梯的用途是「在预算内尽量多采样」，不是「一路睡到预算用尽」。任何一档
        // 超过 200ms，「服务已就绪」的发现时刻就可能被推到预算之外，窗口于是带着
        // 「连接中」的指示灯出现——那正是加密这条阶梯要避免的
        for rung in PREWARM_RETRY_DELAYS {
            assert!(rung <= Duration::from_millis(200), "阶梯过疏: {:?}", rung);
        }
        // 反过来说，第一轮阶梯也不该长到一次就把预算睡完
        let first_pass: Duration = PREWARM_RETRY_DELAYS.iter().sum();
        assert!(first_pass < PREWARM_MAX_WAIT);
    }
}

/**
 * 共享元素转场：封面在播放栏与沉浸页之间飞行。
 *
 * 两端的封面都在各自布局里，位置由 grid + clamp 决定，JS 算不出来，所以
 * 飞行副本的位置在运行时测量：起点用一端的 getBoundingClientRect，终点用
 * 另一端。副本挂在 body 上（position: fixed），只动 transform + 用
 * transform-origin: 0 0，起点矩形因此能精确对上。
 *
 * 飞行期间把两端封面藏起来（副本就是它们），落位后再显示，避免重影；
 * 系统开了「减少动态效果」或两端拿不到封面时直接跳过，由各自的淡入淡出兜底。
 */

const FALLBACK_DURATION_MS = 300;
const FALLBACK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

let sourceEl: HTMLElement | null = null;

/** 播放栏封面登记自己：进入沉浸时它是起点，退出时是终点 */
export function registerCoverFlightSource(el: HTMLElement | null) {
  sourceEl = el;
}

export function getCoverFlightSource(): HTMLElement | null {
  return sourceEl;
}

export type CoverFlightPhase = "enter" | "leave";

interface FlightStyle {
  durationMs: number;
  easing: string;
}

function readFlightStyle(phase: CoverFlightPhase): FlightStyle {
  const styles = getComputedStyle(document.documentElement);
  const durationToken =
    phase === "enter" ? "--app-motion-flight-enter" : "--app-motion-flight-leave";
  const durationMs = Number.parseFloat(styles.getPropertyValue(durationToken));
  return {
    durationMs: Number.isFinite(durationMs) ? durationMs : FALLBACK_DURATION_MS,
    easing: styles.getPropertyValue("--app-motion-ease-out").trim() || FALLBACK_EASING,
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function coverImageUrl(...elements: HTMLElement[]): string {
  for (const el of elements) {
    const src = el.querySelector("img")?.getAttribute("src");
    if (src) return src;
  }
  return "";
}

export interface CoverFlightOptions {
  phase: CoverFlightPhase;
  /** 终点封面是否也要藏起来：进场时沉浸页大封面已经画在落点上，不藏会重影；
      退场时终点是播放栏封面，藏着反而会让播放栏空一块。 */
  hideTarget: boolean;
}

/** 执行飞行；返回是否真的飞了（没飞时调用方不必等待） */
export async function playCoverFlight(
  from: HTMLElement | null,
  to: HTMLElement | null,
  { phase, hideTarget }: CoverFlightOptions
): Promise<boolean> {
  if (!from || !to || prefersReducedMotion()) return false;

  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  if (fromRect.width < 1 || toRect.width < 1) return false;

  const url = coverImageUrl(to, from);
  if (!url) return false;

  const { durationMs, easing } = readFlightStyle(phase);
  const scale = fromRect.width / toRect.width;
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;

  const clone = document.createElement("div");
  clone.className = "cover-flight";
  clone.style.left = `${toRect.left}px`;
  clone.style.top = `${toRect.top}px`;
  clone.style.width = `${toRect.width}px`;
  clone.style.height = `${toRect.height}px`;
  clone.style.backgroundImage = `url("${url}")`;
  // 先摆到起点：动画首帧生效前也不会闪一下落点
  clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  document.body.appendChild(clone);

  const fromVisibility = from.style.visibility;
  const toVisibility = to.style.visibility;
  from.style.visibility = "hidden";
  if (hideTarget) to.style.visibility = "hidden";

  try {
    const animation = clone.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: "translate(0px, 0px) scale(1)" },
      ],
      { duration: durationMs, easing, fill: "forwards" }
    );
    await animation.finished;
  } catch {
    // 动画被取消（节点提前卸载等）时照常走下面的清理
  } finally {
    clone.remove();
    from.style.visibility = fromVisibility;
    if (hideTarget) to.style.visibility = toVisibility;
  }

  return true;
}

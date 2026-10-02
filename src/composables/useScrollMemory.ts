/**
 * 列表/网格的滚动位置记忆。
 *
 * 位置只活在应用内存里：跨启动恢复没有意义（内容可能已经变化），而进程内
 * 的来回切换（详情↔列表、页签切换）正是需要它的场景。顶部位置不记录——
 * 回到顶部是默认行为，记了反而多一次赋值。
 */
const positions = new Map<string, number>();

export function saveScrollPosition(key: string, top: number): void {
  if (!key) return;
  if (top <= 0) {
    positions.delete(key);
    return;
  }
  positions.set(key, top);
}

export function getScrollPosition(key: string): number {
  if (!key) return 0;
  return positions.get(key) ?? 0;
}

export function clearScrollPositions(): void {
  positions.clear();
}

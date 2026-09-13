import { config } from "@vue/test-utils";
import {
  ElButton,
  ElCheckbox,
  ElIcon,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTooltip,
} from "element-plus";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: createMemoryStorage(),
});

config.global.components = {
  ElButton,
  ElCheckbox,
  ElIcon,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTooltip,
};
config.global.stubs = {
  transition: false,
};

/**
 * jsdom 不实现 ResizeObserver。留空的桩会让所有依赖尺寸的逻辑（虚拟滚动、
 * useElementSize）永远拿不到尺寸，从而退化成"渲染 0 行"而无法被测试。
 *
 * 真实 ResizeObserver 在 observe() 时会立刻回调一次当前尺寸，这里照做：
 * 测试只要 stub 元素的 clientWidth/clientHeight，虚拟列表就会按可视区渲染。
 * jsdom 下这两个属性默认为 0，与原来的空桩行为一致，不会影响其他测试。
 */
class ResizeObserverMock implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const width = target.clientWidth;
    const height = target.clientHeight;
    const contentRect = {
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRectReadOnly;
    this.callback(
      [{ target, contentRect } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }

  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

/**
 * jsdom 没有实现 scrollIntoView（Element.prototype 上压根没这个方法）。
 * 任何「挂载后把当前项滚进视野」的组件都会在挂载时抛错，而且是异步抛，
 * 表现为一条不影响断言的 Unhandled Rejection——测试全绿但输出一片红，
 * 真出问题时反而看不见。桩成空实现即可，测试关心的从来不是滚动本身。
 */
Object.defineProperty(Element.prototype, "scrollIntoView", {
  writable: true,
  value: () => undefined,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

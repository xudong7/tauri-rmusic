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

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
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

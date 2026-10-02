import { createApp } from "vue";
import { createPinia } from "pinia";
import {
  ElButton,
  ElCheckbox,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElIcon,
  ElInput,
  ElOption,
  ElPopconfirm,
  ElScrollbar,
  ElSegmented,
  ElSelect,
  ElSkeleton,
  ElSlider,
  ElSwitch,
  ElTooltip,
} from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/checkbox/style/css";
import "element-plus/es/components/dropdown/style/css";
import "element-plus/es/components/empty/style/css";
import "element-plus/es/components/icon/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/option/style/css";
import "element-plus/es/components/popconfirm/style/css";
import "element-plus/es/components/scrollbar/style/css";
import "element-plus/es/components/segmented/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/skeleton/style/css";
import "element-plus/es/components/slider/style/css";
import "element-plus/es/components/switch/style/css";
import "element-plus/es/components/tooltip/style/css";
// Element Plus 深色变量表。逐组件引入 style/css 只带浅色变量，
// 缺了这份，深色主题下 el-segmented 悬停、el-skeleton 高光、popconfirm
// 描边等会退回浅色默认值（近白块）。
// 必须排在 themes.css 之前：两者都是 html.dark 特异度，靠顺序决定胜负，
// 放前面才能让 themes.css 里的自定义配色覆盖 EP 默认值。
import "element-plus/theme-chalk/dark/css-vars.css";
import "./assets/styles/themes.css";
import "./assets/styles/message.css";
import App from "./App.vue";
import LyricsOverlay from "./components/feature/LyricsOverlay/LyricsOverlay.vue";
import router from "./router";
import { i18n } from "./i18n";
import { useThemeStore } from "./stores/themeStore";
import { getCurrentWindow } from "@tauri-apps/api/window";

// 桌面歌词是独立的 webview 窗口，加载同一份前端；按窗口 label 决定根组件，
// 避免在悬浮窗里挂载整个应用（播放器 store、路由、快捷键都不该跑两份）。
// 浏览器里直接预览（非 Tauri）时退回主窗入口。
function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}
const isLyricsWindow = currentWindowLabel() === "lyrics";
if (isLyricsWindow) document.documentElement.classList.add("lyrics-window");
const app = createApp(isLyricsWindow ? LyricsOverlay : App);
const pinia = createPinia();

app.use(pinia);
useThemeStore(pinia).initializeTheme();
app.use(i18n);
[
  ElButton,
  ElCheckbox,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElIcon,
  ElInput,
  ElOption,
  ElPopconfirm,
  ElScrollbar,
  ElSegmented,
  ElSelect,
  ElSkeleton,
  ElSlider,
  ElSwitch,
  ElTooltip,
].forEach((component) => app.use(component));
// 悬浮窗不接路由：它的内容完全由主窗事件驱动
if (!isLyricsWindow) app.use(router);
app.mount("#app");

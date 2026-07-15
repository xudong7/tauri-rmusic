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
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/skeleton/style/css";
import "element-plus/es/components/slider/style/css";
import "element-plus/es/components/switch/style/css";
import "element-plus/es/components/tooltip/style/css";
// 导入全局主题样式
import "./assets/styles/themes.css";
import "./assets/styles/message.css";
import App from "./App.vue";
import router from "./router";
import { i18n } from "./i18n";
import { useThemeStore } from "./stores/themeStore";

const app = createApp(App);
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
  ElSelect,
  ElSkeleton,
  ElSlider,
  ElSwitch,
  ElTooltip,
].forEach((component) => app.use(component));
app.use(router);
app.mount("#app");

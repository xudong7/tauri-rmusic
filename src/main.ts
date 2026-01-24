import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
// 导入全局主题样式
import "./assets/styles/themes.css";
import "./assets/styles/message.css";
import App from "./App.vue";
import router from "./router";
import { i18n } from "./i18n";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(i18n);
app.use(ElementPlus);
app.use(router);
app.mount("#app");

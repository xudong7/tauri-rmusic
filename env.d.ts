/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** 由 vite.config.ts 的 define 注入，值取自 package.json 的 version */
declare const __APP_VERSION__: string;

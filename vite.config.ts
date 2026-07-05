import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  // 路径别名：用 config 所在目录作为项目根，避免 Tauri dev 下 cwd 不同导致 @ 解析成 /src
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  // Tauri客户端配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("element-plus") || id.includes("@element-plus")) {
            return "element-plus";
          }
          if (id.includes("@tauri-apps")) return "tauri-api";
          if (
            id.includes("/vue/") ||
            id.includes("/vue-router/") ||
            id.includes("/pinia/") ||
            id.includes("/vue-i18n/") ||
            id.includes("@vueuse")
          ) {
            return "vue-vendor";
          }
          return "vendor";
        },
      },
    },
  },
});

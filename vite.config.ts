import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://dashscope.aliyuncs.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, "/compatible-mode/v1"),
      },
      "/api-intl": {
        target: "https://dashscope-intl.aliyuncs.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api-intl/, "/compatible-mode/v1"),
      },
    },
  },
});

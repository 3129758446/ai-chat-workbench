import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {   // 启用开发服务器能力（包括代理），让请求可以在 dev server 层被转发。
    proxy: {  // 定义哪些同源路径要被代理转发到真实上游。
      "/api": { // 语言版本为中文的接口，给国内通道做代理。
        target: "https://dashscope.aliyuncs.com", // 代理目标地址，前端请求 /api 开头的路径时会被转发到这个地址。
        changeOrigin: true, // 修改请求头中的 Origin 字段，使其看起来像是直接请求目标地址，避免 CORS 问题。
        secure: true, // 要求 HTTPS 证书校验，保证是标准安全连接。
        rewrite: (path) => path.replace(/^\/api/, "/compatible-mode/v1"),
      },
      "/api-intl": { // 语言版本为英文的接口，给国际备份通道同样做代理，保持与国内通道一致的访问方式。
        target: "https://dashscope-intl.aliyuncs.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api-intl/, "/compatible-mode/v1"),
      },
    },
  },
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置文件
 * 职责：
 * 1. 定义测试运行的环境（BaseURL、浏览器类型）。
 * 2. 配置 WebServer，实现测试运行时自动启动 Vite。
 */
export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    /* 所有的页面操作都会基于这个地址 */
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* 配置项目：只测试 Chromium 以节省本地资源，简历中可提到支持多浏览器 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 核心：在运行测试前自动启动 Vite 开发服务器 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});

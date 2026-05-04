import { test, expect } from "@playwright/test";

/**
 * E2E 测试：chat.spec.ts
 * 目标：验证核心业务链路（首页提问 -> 自动跳转 -> AI 回复）。
 * 大厂价值点：这是最接近真实用户行为的测试，证明了“系统整体可用”。
 */

test("用户应该能从首页发起提问并获得回复", async ({ page }) => {
  // 1. 拦截 API 请求，模拟流式回复 (Mocking)
  // 这样测试就不需要真实的 API Key，且运行速度极快
  await page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"你好！我是灵犀 AI 助手，很高兴为你服务。"}}]}\n\ndata: [DONE]\n\n',
    });
  });

  // 2. 访问首页
  await page.goto("/");

  // 3. 找到输入框并输入问题
  const input = page.locator("#messageInput");
  await input.fill("你好");

  // 4. 点击发送按钮
  await page.click("#sendBtn");

  // 5. 验证是否跳转到了聊天页面
  await expect(page).toHaveURL(/\/chat\//);

  // 6. 验证 AI 回复内容
  // 使用 toContainText 而不是 innerText，因为它内置了自动等待和重试机制
  const aiBubble = page.locator(".bubble.ai");
  await expect(aiBubble).toContainText("我是灵犀 AI 助手", { timeout: 10000 });
});

test("点击侧边栏“新建”应该返回首页", async ({ page }) => {
  // 1. 先进入一个会话页
  await page.goto("/");
  await page.locator("#messageInput").fill("test");
  await page.click("#sendBtn");
  await expect(page).toHaveURL(/\/chat\//);

  // 2. 点击侧边栏的“新建”按钮
  await page.click(".sidebar-create-btn");

  // 3. 验证是否回到了首页
  await expect(page).toHaveURL(/\/$/);
});

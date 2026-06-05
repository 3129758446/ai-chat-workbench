import { test, expect, type Page } from "@playwright/test";

async function mockChatCompletion(page: Page) {
  await page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"你好！我是灵犀 AI 助手，很高兴为你服务。"}}]}\n\ndata: [DONE]\n\n',
    });
  });
}

async function setTestApiKey(page: Page) {
  page.on("dialog", async (dialog) => {
    await dialog.accept("test-key");
  });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("LINGXI_API_KEY", "test-key");
  });
}

async function installCleanTestStorage(page: Page) {
  page.on("dialog", async (dialog) => {
    await dialog.accept("test-key");
  });
  await page.context().addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("LINGXI_API_KEY", "test-key");
  });
}

test("用户应该能从首页发起提问并获得回复", async ({ page }) => {
  await mockChatCompletion(page);
  await installCleanTestStorage(page);
  await page.goto("/");
  await setTestApiKey(page);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("LINGXI_API_KEY")))
    .toBe("test-key");

  await page.locator("#messageInput").fill("你好");
  await page.click("#sendBtn");

  await expect(page).toHaveURL(/\/chat\//);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("LINGXI_API_KEY")))
    .toBe("test-key");
  await expect(page.locator(".bubble.ai")).toContainText("我是灵犀 AI 助手", {
    timeout: 10000,
  });
});

test("mobile chat keeps conversations collapsed until requested", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator(".mobile-chat-bar")).toBeVisible();
  await expect(page.locator(".sidebar-drawer")).not.toHaveClass(/open/);
  await expect(page.locator(".sidebar-backdrop")).not.toHaveClass(/open/);

  await page.getByRole("button", { name: "打开会话列表" }).click();

  await expect(page.locator(".sidebar-drawer")).toHaveClass(/open/);
  await expect(page.locator(".sidebar-backdrop")).toHaveClass(/open/);

  await page.mouse.click(382, 420);

  await expect(page.locator(".sidebar-drawer")).not.toHaveClass(/open/);
  await expect(page.locator(".sidebar-backdrop")).not.toHaveClass(/open/);
});

test("mobile home prompt cards render as a 2x2 grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const cards = page.locator(".quick-card");
  await expect(cards).toHaveCount(4);

  const boxes = await Promise.all(
    [0, 1, 2, 3].map((index) => cards.nth(index).boundingBox()),
  );
  boxes.forEach((box) => {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    expect(box?.height ?? 0).toBeLessThanOrEqual(112);
  });
  expect(boxes[0]?.y).toBe(boxes[1]?.y);
  expect(boxes[2]?.y).toBe(boxes[3]?.y);
  expect(boxes[2]?.y ?? 0).toBeGreaterThan(boxes[0]?.y ?? 0);
});

test("mobile composer keeps model selector inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const selectBox = await page.locator(".model-select").boundingBox();
  const inputBox = await page.locator("#messageInput").boundingBox();
  expect(selectBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect((selectBox?.x ?? 0) + (selectBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  );
  expect((selectBox?.y ?? 0) + (selectBox?.height ?? 0)).toBeLessThanOrEqual(
    inputBox?.y ?? 0,
  );
  expect(selectBox?.x ?? 0).toBeGreaterThan(inputBox?.x ?? 0);
});

test("mobile header exposes the theme toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "切换主题" })).toBeVisible();
});

test("mobile chat opens an existing conversation at the bottom", async ({
  page,
}) => {
  const conversationId = "scroll-check";
  const now = Date.now();
  const messages = Array.from({ length: 36 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text: `Long message ${index + 1}\n`.repeat(10),
  }));

  await page.route("**/local-api/chat-state", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: {
            theme: "dark",
            modelProvider: "auto",
            currentConversationId: conversationId,
            orderedConversationIds: [conversationId],
            conversations: {
              [conversationId]: {
                id: conversationId,
                title: "Scroll check",
                createdAt: now,
                updatedAt: now,
                lastMessagePreview: "bottom",
                draftInput: "",
                messages,
                chatHistory: [],
              },
            },
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/chat/${conversationId}`);

  await expect(page.locator(".message-row")).toHaveCount(messages.length);
  await page.waitForTimeout(1000);

  const distanceFromBottom = await page.evaluate(
    () => {
      const distance =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      return {
        distance,
        bodyScrollHeight: document.body.scrollHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        windowScrollY: window.scrollY,
        innerHeight: window.innerHeight,
        chatShell: getComputedStyle(document.querySelector(".chat-shell")!)
          .paddingTop,
        appPaddingBottom: getComputedStyle(document.querySelector(".app")!)
          .paddingBottom,
      };
    },
  );

  expect(distanceFromBottom.distance).toBeLessThanOrEqual(4);
});

test("mobile chat keeps the window scrollbar pinned during streaming", async ({
  page,
}) => {
  const conversationId = "stream-scroll-check";
  const now = Date.now();

  await page.route("**/local-api/chat-state", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: {
            theme: "dark",
            modelProvider: "lingxi",
            currentConversationId: conversationId,
            orderedConversationIds: [conversationId],
            conversations: {
              [conversationId]: {
                id: conversationId,
                title: "Stream scroll check",
                createdAt: now,
                updatedAt: now,
                lastMessagePreview: "",
                draftInput: "",
                messages: Array.from({ length: 18 }, (_, index) => ({
                  id: `history-${index}`,
                  role: index % 2 === 0 ? "user" : "assistant",
                  text: `History message ${index + 1}\n`.repeat(8),
                })),
                chatHistory: [],
              },
            },
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"choices":[{"delta":{"content":"第一段\\n\\n"}}]}',
        "",
        `data: {"choices":[{"delta":{"content":"${"持续输出内容。".repeat(3000)}"}}]}`,
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("LINGXI_API_KEY", "test-key");
  });
  page.on("dialog", async (dialog) => {
    await dialog.accept("test-key");
  });

  await page.goto(`/chat/${conversationId}`);
  await expect(page.locator(".message-row")).toHaveCount(18);

  await page.locator("#messageInput").fill("continue");
  await page.click("#sendBtn");
  await expect(page.locator(".message-row")).toHaveCount(20);
  await page.waitForTimeout(1500);
  await expect(page.locator(".bubble.ai").last()).toContainText("持续输出内容", {
    timeout: 10000,
  });
  await page.waitForTimeout(120);

  const streamingDistanceFromBottom = await page.evaluate(() => {
    const distance =
      document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    return {
      distance,
      bodyScrollHeight: document.body.scrollHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      windowScrollY: window.scrollY,
      innerHeight: window.innerHeight,
      chatShellPaddingTop: getComputedStyle(
        document.querySelector(".chat-shell")!,
      ).paddingTop,
      appPaddingBottom: getComputedStyle(document.querySelector(".app")!)
        .paddingBottom,
    };
  });

  expect(streamingDistanceFromBottom.distance).toBeLessThanOrEqual(4);

  await expect(page.locator(".bubble.ai").last()).toContainText("持续输出内容", {
    timeout: 10000,
  });
  await expect(page.locator("#stopBtn")).not.toHaveClass(/active/, {
    timeout: 60000,
  });

  const distanceFromBottom = await page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      window.innerHeight -
      window.scrollY,
  );

  expect(distanceFromBottom).toBeLessThanOrEqual(4);
});

test("desktop chat keeps the sidebar in the page layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator(".mobile-chat-bar")).toBeHidden();
  await expect(page.locator(".conversation-sidebar")).toBeVisible();
});

test("点击侧边栏“新建”应该返回首页", async ({ page }) => {
  await mockChatCompletion(page);
  await installCleanTestStorage(page);
  await page.goto("/");
  await setTestApiKey(page);

  await page.locator("#messageInput").fill("test");
  await page.click("#sendBtn");
  await expect(page).toHaveURL(/\/chat\//);

  await page.click(".sidebar-create-btn");

  await expect(page).toHaveURL(/\/$/);
});

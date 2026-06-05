import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";

/**
 * 组件测试：ChatPanel.test.tsx
 * 目标：验证消息列表渲染与流式动画。
 * 大厂价值点：测试了复杂的条件渲染（用户 vs 助手）以及流式输出时的“打字中”状态切换。
 */

// Mock markdown 工具函数
vi.mock("../utils/markdown", () => ({
  renderMarkdownToHtml: vi.fn((text) => Promise.resolve(`<p>${text}</p>`)),
  enhanceCodeBlocks: vi.fn(),
}));

describe("ChatPanel 组件渲染测试", () => {
  const mockMessages = [
    { id: "1", role: "user" as const, text: "你好" },
    { id: "2", role: "assistant" as const, text: "我是 AI 助手" },
  ];

  it("应正确渲染用户和助手的消息", async () => {
    render(<ChatPanel messages={mockMessages} isStreaming={false} />);

    expect(screen.getByText("你好")).toBeInTheDocument();
    // 助手消息是异步渲染的
    await waitFor(() => {
      expect(screen.getByText("我是 AI 助手")).toBeInTheDocument();
    });
  });

  it("当助手正在流式回复且文本为空时，应显示打字动画", () => {
    const streamingMessages = [
      { id: "1", role: "user" as const, text: "你好" },
      { id: "2", role: "assistant" as const, text: "" },
    ];

    const { container } = render(
      <ChatPanel messages={streamingMessages} isStreaming={true} />,
    );

    // 查找打字动画节点
    const typingDots = container.querySelector(".typing-dots");
    expect(typingDots).toBeInTheDocument();
  });

  it("非最后一条助手消息不应显示打字动画", async () => {
    const messages = [
      { id: "1", role: "assistant" as const, text: "旧消息" },
      { id: "2", role: "user" as const, text: "新问题" },
    ];

    const { container } = render(
      <ChatPanel messages={messages} isStreaming={true} />,
    );

    // 等待异步渲染完成，避免 act 警告
    await waitFor(() => {
      expect(screen.getByText("旧消息")).toBeInTheDocument();
    });

    const typingDots = container.querySelector(".typing-dots");
    expect(typingDots).not.toBeInTheDocument();
  });
});

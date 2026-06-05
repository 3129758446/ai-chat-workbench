import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WelcomeSection } from "./WelcomeSection";

/**
 * 组件测试：WelcomeSection.test.tsx
 * 目标：验证 UI 渲染与用户交互回调。
 * 大厂价值点：组件测试确保了 UI 的“契约”不被破坏，模拟真实用户的点击行为。
 */

describe("WelcomeSection 组件测试", () => {
  const defaultProps = {
    hidden: false,
    disabled: false,
    onPrompt: vi.fn(),
  };

  it("应该正确渲染标题和副标题", () => {
    render(<WelcomeSection {...defaultProps} />);
    
    expect(screen.getByText("嗨，我是你的AI助手")).toBeInTheDocument();
    expect(screen.getByText("我能帮你做些什么？")).toBeInTheDocument();
  });

  it("点击快捷问题卡片时应触发 onPrompt 回调", () => {
    render(<WelcomeSection {...defaultProps} />);
    
    // 找到第一个快捷问题卡片
    const firstCard = screen.getAllByRole("button")[0];
    fireEvent.click(firstCard);
    
    expect(defaultProps.onPrompt).toHaveBeenCalledTimes(1);
    expect(typeof defaultProps.onPrompt.mock.calls[0][0]).toBe("string");
  });

  it("当 hidden 为 true 时，组件应包含 hidden 类名", () => {
    const { container } = render(<WelcomeSection {...defaultProps} hidden={true} />);
    expect(container.firstChild).toHaveClass("hidden");
  });

  it("当 disabled 为 true 时，按钮应处于禁用状态", () => {
    render(<WelcomeSection {...defaultProps} disabled={true} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});

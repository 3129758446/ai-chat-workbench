import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConversationManager } from "./useConversationManager";
import { BrowserRouter } from "react-router-dom";
import React from "react";

/**
 * Hook 测试：useConversationManager.test.ts
 * 目标：验证业务逻辑钩子的状态流转与副作用（如路由跳转）。
 * 大厂价值点：Hook 测试能脱离复杂的渲染环境，纯粹地验证“大脑”逻辑是否正确。
 */

// 模拟 useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("useConversationManager Hook 测试", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  );

  it("handleCreateConversation 应该跳转到首页", () => {
    const { result } = renderHook(() => useConversationManager(null), { wrapper });
    
    act(() => {
      result.current.handleCreateConversation();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("handleSelectConversation 应该跳转到指定的聊天页面", () => {
    const { result } = renderHook(() => useConversationManager(null), { wrapper });
    const testId = "test-conv-123";
    
    act(() => {
      result.current.handleSelectConversation(testId);
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/chat/${testId}`);
  });
});

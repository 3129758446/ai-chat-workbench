import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConversationManager } from "./useConversationManager";
import { BrowserRouter } from "react-router-dom";
import React from "react";
import { useChatStore } from "../store";

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
    useChatStore.setState({
      currentConversationId: null,
      orderedConversationIds: [],
      conversations: {},
      abortControllers: {},
    });
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

  it("删除当前会话后应返回首页", () => {
    useChatStore.setState((state) => ({
      ...state,
      currentConversationId: "conv-1",
      orderedConversationIds: ["conv-1", "conv-2"],
      conversations: {
        ...state.conversations,
        "conv-1": {
          id: "conv-1",
          title: "会话 1",
          messages: [],
          chatHistory: [],
          draftInput: "",
          uploadingImages: [],
          uploadingFiles: [],
          isStreaming: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMessagePreview: "",
        },
        "conv-2": {
          id: "conv-2",
          title: "会话 2",
          messages: [],
          chatHistory: [],
          draftInput: "",
          uploadingImages: [],
          uploadingFiles: [],
          isStreaming: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMessagePreview: "",
        },
      },
      abortControllers: {
        ...state.abortControllers,
        "conv-1": null,
        "conv-2": null,
      },
    }));

    const stopStreaming = vi.fn();
    const { result } = renderHook(() => useConversationManager("conv-1"), {
      wrapper,
    });

    act(() => {
      result.current.handleDeleteConversation("conv-1", stopStreaming);
    });

    expect(stopStreaming).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });
});

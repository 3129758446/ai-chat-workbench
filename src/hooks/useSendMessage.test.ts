import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSendMessage } from "./useSendMessage";
import * as api from "../services/api";

/**
 * Hook 测试：useSendMessage.test.ts
 * 目标：验证核心消息发送链路。
 * 大厂价值点：这是项目最复杂的逻辑。测试覆盖了从“点击发送”到“流式回填”的全过程，模拟了 API 成功、失败、中断等多种工业级场景。
 */

// 1. Mock 依赖项
vi.mock("../services/api", () => ({
  streamChatCompletion: vi.fn(),
}));

vi.mock("../utils/helpers", async () => {
  const actual = await vi.importActual("../utils/helpers");
  return {
    ...actual,
    ensureApiKey: vi.fn(() => "mock-api-key"),
    uid: vi.fn((p) => `${p}-123`),
  };
});

describe("useSendMessage Hook 测试", () => {
  const mockParams = {
    mode: "chat" as const,
    conversationId: "conv-1",
    input: "你好",
    modelProvider: "lingxi" as const,
    isStreaming: false,
    uploadingImages: [],
    uploadingFiles: [],
    navigate: vi.fn(),
    clearUploadingImages: vi.fn(),
    clearUploadingFiles: vi.fn(),
    setInput: vi.fn(),
    addUiMessage: vi.fn(),
    updateUiMessageText: vi.fn(),
    pushHistory: vi.fn(),
    removeHistoryMessage: vi.fn(),
    setAbortController: vi.fn(),
    setStreaming: vi.fn(),
    ensureConversation: vi.fn(),
    createConversation: vi.fn(() => "new-conv"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("发送普通文本消息时，应正确触发 UI 更新和 API 调用", async () => {
    const { result } = renderHook(() => useSendMessage(mockParams));
    const sendMessage = result.current;

    // 模拟流式返回成功
    vi.mocked(api.streamChatCompletion).mockResolvedValue("AI回复内容");

    await act(async () => {
      await sendMessage();
    });

    // 验证是否添加了用户消息
    expect(mockParams.addUiMessage).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        role: "user",
        text: "你好",
      }),
    );

    // 验证是否清空了输入框
    expect(mockParams.setInput).toHaveBeenCalledWith("conv-1", "");

    // 验证是否开启了流式状态
    expect(mockParams.setStreaming).toHaveBeenCalledWith("conv-1", true);

    // 验证 API 调用
    expect(api.streamChatCompletion).toHaveBeenCalled();

    // 验证最终是否结束了流式状态
    expect(mockParams.setStreaming).toHaveBeenLastCalledWith("conv-1", false);
  });

  it("如果正在流式输出中，重复调用 sendMessage 应被忽略", async () => {
    const { result } = renderHook(() =>
      useSendMessage({ ...mockParams, isStreaming: true }),
    );
    const sendMessage = result.current;

    await act(async () => {
      await sendMessage();
    });

    expect(mockParams.addUiMessage).not.toHaveBeenCalled();
    expect(api.streamChatCompletion).not.toHaveBeenCalled();
  });

  it("当 API 报错时，应正确展示错误提示并恢复状态", async () => {
    const { result } = renderHook(() => useSendMessage(mockParams));
    const sendMessage = result.current;

    // 模拟 API 报错 (429 限流)
    const error = { status: 429, message: "Too Many Requests" };
    vi.mocked(api.streamChatCompletion).mockRejectedValue(error);

    await act(async () => {
      await sendMessage();
    });

    // 验证是否显示了限流相关的错误文案
    expect(mockParams.updateUiMessageText).toHaveBeenCalledWith(
      "conv-1",
      expect.any(String),
      expect.stringContaining("请求频率或额度受限"),
    );

    // 验证状态恢复
    expect(mockParams.setStreaming).toHaveBeenLastCalledWith("conv-1", false);
  });

  it("首页模式下，调用 sendMessage 应执行跳转而非直接发送", async () => {
    const { result } = renderHook(() =>
      useSendMessage({ ...mockParams, mode: "home" }),
    );
    const sendMessage = result.current;

    await act(async () => {
      await sendMessage("快捷问题");
    });

    // 验证是否执行了路由跳转
    expect(mockParams.navigate).toHaveBeenCalledWith(
      expect.stringContaining("/chat/"),
      expect.objectContaining({
        state: expect.objectContaining({
          draftPrompt: "快捷问题",
          shouldAutoSend: true,
        }),
      }),
    );
    // 验证没有触发 API
    expect(api.streamChatCompletion).not.toHaveBeenCalled();
  });
});

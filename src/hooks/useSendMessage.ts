/**
 * 文件功能：封装“发送消息”完整流程，统一处理首页跳转、流式请求、历史维护与错误提示。
 * 设计思路：
 * 1. 将发送链路从 App.tsx 抽离为 hook，主组件仅负责页面编排和事件绑定。
 * 2. 发送采用“先更新 UI，再流式回填”的策略，保证用户操作即时反馈。
 * 3. 错误信息按场景分级（鉴权/限流/网络/中断），给出可执行的下一步提示。
 * 4. 通过 useCallback 固定函数引用，避免 effect 依赖因函数地址变化触发重复执行。
 */

import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import { API_KEY_STORAGE, DEEPSEEK_API_KEY_STORAGE } from "../constants";
import type { ChatProvider } from "../services/api";
import { streamChatCompletion } from "../services/api";
import { useChatStore } from "../store";
import type {
  ApiMessage,
  MessagePart,
  UiMessage,
  UploadingImage,
  UploadingTextFile,
  ModelProviderMode,
} from "../types/chat";
import {
  ensureApiKey,
  escapeHtml,
  normalizeApiKey,
  uid,
} from "../utils/helpers";
import { buildUserMessageContent } from "../utils/messageContent";

function createTypewriterUpdater(onText: (text: string) => void) {
  let shownText = "";
  let targetText = "";
  let timerId: number | null = null;
  const waiters: Array<() => void> = [];

  const resolveWaiters = () => {
    if (shownText !== targetText) {
      return;
    }
    while (waiters.length) {
      waiters.shift()?.();
    }
  };

  const stopTimer = () => {
    if (timerId === null) {
      return;
    }
    window.clearInterval(timerId);
    timerId = null;
  };

  const step = () => {
    const backlog = targetText.length - shownText.length;
    if (backlog <= 0) {
      stopTimer();
      resolveWaiters();
      return;
    }

    // 服务端可能一次吐出大块内容，这里按 backlog 自适应追赶，既顺滑又不拖太久。
    const chunkSize = Math.max(1, Math.min(16, Math.ceil(backlog / 28)));
    shownText = targetText.slice(0, shownText.length + chunkSize);
    onText(shownText);
  };

  const ensureTimer = () => {
    if (timerId !== null) {
      return;
    }
    timerId = window.setInterval(step, 16);
  };

  return {
    push(nextText: string) {
      if (nextText.length < targetText.length) {
        shownText = nextText;
        onText(shownText);
      }
      targetText = nextText;
      ensureTimer();
    },
    flush(finalText: string) {
      targetText = finalText;
      ensureTimer();
      return new Promise<void>((resolve) => {
        if (shownText === targetText) {
          resolve();
          return;
        }
        waiters.push(resolve);
      });
    },
    cancel() {
      stopTimer();
      waiters.splice(0).forEach((resolve) => resolve());
    },
  };
}

interface UseSendMessageParams {
  mode: "home" | "chat"; // 当前页面模式：首页仅负责收集问题并跳转，聊天页才实际发请求
  conversationId: string | null;
  input: string; // 输入框当前文本
  modelProvider: ModelProviderMode; // 当前选中的模型模式
  isStreaming: boolean; // 当前是否在流式响应中，用于防并发发送
  uploadingImages: UploadingImage[]; // 待发送图片列表
  uploadingFiles: UploadingTextFile[]; // 待发送文本文件列表
  navigate: NavigateFunction;
  clearUploadingImages: (conversationId: string) => void;
  clearUploadingFiles: (conversationId: string) => void;
  setInput: (conversationId: string, value: string) => void;
  addUiMessage: (conversationId: string, message: UiMessage) => void;
  updateUiMessageText: (
    conversationId: string,
    messageId: string,
    text: string,
  ) => void;
  pushHistory: (conversationId: string, message: ApiMessage) => void;
  removeHistoryMessage: (conversationId: string, message: ApiMessage) => void;
  setAbortController: (
    conversationId: string,
    controller: AbortController | null,
  ) => void;
  setStreaming: (conversationId: string, value: boolean) => void;
  ensureConversation: (conversationId: string) => void;
  createConversation: () => string;
}

export function useSendMessage({
  mode,
  conversationId,
  input,
  modelProvider,
  isStreaming,
  uploadingImages,
  uploadingFiles,
  navigate,
  clearUploadingImages,
  clearUploadingFiles,
  setInput,
  addUiMessage,
  updateUiMessageText,
  pushHistory,
  removeHistoryMessage,
  setAbortController,
  setStreaming,
  ensureConversation,
  createConversation,
}: UseSendMessageParams) {
  // 当本地缺少 Key 时即时弹窗录入，降低首次使用门槛。
  const promptForApiKey = (provider: ChatProvider): string => {
    const storageKey =
      provider === "deepseek" ? DEEPSEEK_API_KEY_STORAGE : API_KEY_STORAGE;
    const label =
      provider === "deepseek" ? "DEEPSEEK_API_KEY" : "LINGXI_API_KEY";
    const inputValue = window.prompt(
      `未检测到本地 API Key，请输入你的 ${label}：`,
    );
    const nextKey = normalizeApiKey(inputValue);
    if (!nextKey) {
      return "";
    }
    localStorage.setItem(storageKey, nextKey);
    return nextKey;
  };

  return useCallback(
    async (cardPrompt?: string) => {
      // 1. 首页只负责创建会话并跳转，不直接发请求。
      if (mode === "home") {
        const prompt = (
          typeof cardPrompt === "string" ? cardPrompt : input
        ).trim();

        if (!prompt) {
          const nextId = createConversation();
          navigate(`/chat/${nextId}`);
          return;
        }

        const nextId = createConversation();
        navigate(`/chat/${nextId}`, {
          state: { draftPrompt: prompt, shouldAutoSend: true },
        });
        return;
      }

      const targetConversationId = conversationId || createConversation();
      ensureConversation(targetConversationId);

      // 2. 如果正在流式输出，禁止重复发送。
      if (isStreaming) {
        return;
      }

      // 3. 检查是否有内容，文本和图片都为空时不触发请求。
      const rawText = typeof cardPrompt === "string" ? cardPrompt : input;
      const text = rawText.trim();
      const hasImages = uploadingImages.length > 0;
      const readyFiles = uploadingFiles.filter(
        (file) => file.status === "ready",
      );
      const hasFiles = readyFiles.length > 0;
      if (!text && !hasImages && !hasFiles) {
        return;
      }

      // 4. 确定使用的 provider。
      const hasDeepSeekKey = Boolean(ensureApiKey(DEEPSEEK_API_KEY_STORAGE));
      let provider: ChatProvider;
      if (modelProvider === "lingxi") {
        provider = "lingxi";
      } else if (modelProvider === "deepseek") {
        provider = "deepseek";
      } else {
        // 自动模式：如果有图片走灵犀，否则有 DeepSeek Key 优先走 DeepSeek。
        provider = hasImages
          ? "lingxi"
          : hasDeepSeekKey
            ? "deepseek"
            : "lingxi";
      }

      if (provider === "deepseek" && hasImages) {
        addUiMessage(targetConversationId, {
          id: uid("assistant"),
          role: "assistant",
          text: "DeepSeek 当前未接入图片识别，请切换到“灵犀 / Qwen”或移除图片后再发送。",
        });
        return;
      }

      // 5. 检查当前 provider 对应的 API Key。
      const providerStorageKey =
        provider === "deepseek" ? DEEPSEEK_API_KEY_STORAGE : API_KEY_STORAGE;
      const providerLabel =
        provider === "deepseek" ? "DEEPSEEK_API_KEY" : "LINGXI_API_KEY";
      let apiKey = ensureApiKey(providerStorageKey);
      if (!apiKey) {
        apiKey = promptForApiKey(provider);
        if (!apiKey) {
          addUiMessage(targetConversationId, {
            id: uid("assistant"),
            role: "assistant",
            text: `未输入 ${providerLabel}，本次消息未发送。`,
          });
          return;
        }
      }

      // 复制一份图片数组，避免后续 clear 操作影响当前发送快照。
      const images = [...uploadingImages];
      const files = [...readyFiles];
      const userDisplayText =
        text ||
        (files.length
          ? `（发送了 ${files.length} 个文件）`
          : `（发送了 ${images.length} 张图片）`);

      // 6. 构建发送内容（处理图片），把文本 + 图片转成接口需要的格式。
      let userContent: string | MessagePart[];
      try {
        userContent = await buildUserMessageContent(text, images, files);
      } catch (error) {
        addUiMessage(targetConversationId, {
          id: uid("assistant"),
          role: "assistant",
          text: error instanceof Error ? error.message : "图片处理失败，请重试",
        });
        return;
      }

      // 7. 先把用户消息加到界面，保证立即反馈。
      addUiMessage(targetConversationId, {
        id: uid("user"),
        role: "user",
        text: userDisplayText,
        content: Array.isArray(userContent)
          ? userContent.filter(
              (item): item is MessagePart => item.type === "image_url",
            )
          : undefined,
      });

      const currentUserMessage: ApiMessage = {
        role: "user",
        content: userContent,
      };

      // 8. 把用户消息加入模型历史。
      pushHistory(targetConversationId, currentUserMessage);
      // 9. 清空输入框和待发送图片。
      setInput(targetConversationId, "");
      clearUploadingImages(targetConversationId);
      clearUploadingFiles(targetConversationId);

      // 10. 先插入空的助手消息占位，后续通过 onDelta 实时覆盖文本。
      const assistantId = uid("assistant");
      addUiMessage(targetConversationId, {
        id: assistantId,
        role: "assistant",
        text: "",
      });

      const controller = new AbortController(); // 创建控制器实例，用于可能的请求中断操作
      setAbortController(targetConversationId, controller);
      setStreaming(targetConversationId, true);
      const typewriter = createTypewriterUpdater((nextText) => {
        updateUiMessageText(targetConversationId, assistantId, nextText);
      });

      try {
        // 11. 发起流式请求（核心中的核心）。
        const currentHistory =
          useChatStore.getState().conversations[targetConversationId]
            ?.chatHistory || [];

        const finalText = await streamChatCompletion(
          provider,
          apiKey,
          currentHistory,
          controller.signal,
          (delta) => typewriter.push(delta),
        );
        await typewriter.flush(finalText);

        // 12. 请求完成，把 AI 消息加入历史。
        pushHistory(targetConversationId, {
          role: "assistant",
          content: finalText || "（未返回内容）",
        });
      } catch (error) {
        // 13. 错误处理：中断/鉴权/限流/网络等类型给出可操作提示。
        typewriter.cancel();
        let message = "请求失败，请稍后重试。";
        let shouldReplace = true;

        if (error instanceof Error && error.name === "AbortError") {
          // 用户手动停止时回滚本轮 user 历史，避免污染后续上下文。
          removeHistoryMessage(targetConversationId, currentUserMessage);
          const currentText =
            useChatStore
              .getState()
              .conversations[
                targetConversationId
              ]?.messages.find((item) => item.id === assistantId)?.text || "";

          if (currentText.trim()) {
            shouldReplace = false;
          } else {
            message = "已停止生成。";
          }
        } else {
          const typedError = error as {
            status?: number;
            endpoint?: string;
            message?: string;
          };
          const endpointTip = typedError.endpoint
            ? `（端点：${escapeHtml(typedError.endpoint)}）`
            : "";
          const providerName = provider === "deepseek" ? "DeepSeek" : "灵犀";

          if (typedError.status === 401 || typedError.status === 403) {
            // 鉴权失败时清理本地 Key，避免后续请求重复失败。
            localStorage.removeItem(providerStorageKey);
            message = `鉴权失败：${providerName} API Key 无效、过期或无权限。已清除本地 Key，请重新写入 ${providerLabel} 后再发送。${endpointTip}`;
          } else if (typedError.status === 429) {
            message =
              provider === "deepseek"
                ? `请求频率或额度受限（429）。请稍后重试，或检查 DeepSeek 账户额度。${endpointTip}`
                : `请求频率或额度受限（429）。请稍后重试，或检查百炼账户额度。${endpointTip}`;
          } else if (typedError.status === 400 && hasImages) {
            message = `图片识别请求被拒绝（400）。请确认当前账号开通了视觉模型，并检查模型名是否可用。${endpointTip}`;
          } else if (typedError.message?.includes("Failed to fetch")) {
            message =
              provider === "deepseek"
                ? `网络请求失败。请检查 DeepSeek 代理或网络连接后重试。${endpointTip}`
                : `网络请求失败。若控制台出现 ERR_PROXY_CONNECTION_FAILED，可关闭代理或将 dashscope.aliyuncs.com、dashscope-intl.aliyuncs.com 设为直连后重试。${endpointTip}`;
          } else if (typedError.message) {
            message = `请求失败：${typedError.message}${endpointTip}`;
          }
        }

        if (shouldReplace) {
          updateUiMessageText(targetConversationId, assistantId, message);
        }
      } finally {
        // 无论成功失败都恢复按钮状态。
        setAbortController(targetConversationId, null);
        setStreaming(targetConversationId, false);
      }
    },
    [
      mode,
      conversationId,
      input,
      modelProvider,
      isStreaming,
      uploadingImages,
      uploadingFiles,
      navigate,
      clearUploadingImages,
      clearUploadingFiles,
      setInput,
      addUiMessage,
      updateUiMessageText,
      pushHistory,
      removeHistoryMessage,
      setAbortController,
      setStreaming,
      ensureConversation,
      createConversation,
    ],
  );
}

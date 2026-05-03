import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import { API_KEY_STORAGE } from "../constants";
import { streamChatCompletion } from "../services/api";
import { useChatStore } from "../store/chatStore";
import type {
  ApiMessage,
  MessagePart,
  UiMessage,
  UploadingImage,
} from "../types/chat";
import {
  ensureApiKey,
  escapeHtml,
  normalizeApiKey,
  uid,
} from "../utils/helpers";
import { buildUserMessageContent } from "../utils/messageContent";

interface UseSendMessageParams {
  mode: "home" | "chat";
  conversationId: string | null;
  input: string;
  isStreaming: boolean;
  uploadingImages: UploadingImage[];
  navigate: NavigateFunction;
  clearUploadingImages: (conversationId: string) => void;
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
  isStreaming,
  uploadingImages,
  navigate,
  clearUploadingImages,
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
  const promptForApiKey = (): string => {
    const inputValue = window.prompt(
      "未检测到本地 API Key，请输入你的 LINGXI_API_KEY：",
    );
    const nextKey = normalizeApiKey(inputValue);
    if (!nextKey) {
      return "";
    }
    localStorage.setItem(API_KEY_STORAGE, nextKey);
    return nextKey;
  };

  return useCallback(
    async (cardPrompt?: string) => {
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

      if (isStreaming) {
        return;
      }

      const rawText = typeof cardPrompt === "string" ? cardPrompt : input;
      const text = rawText.trim();
      const hasImages = uploadingImages.length > 0;
      if (!text && !hasImages) {
        return;
      }

      let apiKey = ensureApiKey();
      if (!apiKey) {
        apiKey = promptForApiKey();
        if (!apiKey) {
          addUiMessage(targetConversationId, {
            id: uid("assistant"),
            role: "assistant",
            text: "未输入 API Key，本次消息未发送。",
          });
          return;
        }
      }

      const images = [...uploadingImages];
      const userDisplayText = text || `（发送了 ${images.length} 张图片）`;

      let userContent: string | MessagePart[];
      try {
        userContent = await buildUserMessageContent(text, images);
      } catch (error) {
        addUiMessage(targetConversationId, {
          id: uid("assistant"),
          role: "assistant",
          text: error instanceof Error ? error.message : "图片处理失败，请重试",
        });
        return;
      }

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

      pushHistory(targetConversationId, currentUserMessage);
      setInput(targetConversationId, "");
      clearUploadingImages(targetConversationId);

      const assistantId = uid("assistant");
      addUiMessage(targetConversationId, {
        id: assistantId,
        role: "assistant",
        text: "",
      });

      const controller = new AbortController();
      setAbortController(targetConversationId, controller);
      setStreaming(targetConversationId, true);

      try {
        const currentHistory =
          useChatStore.getState().conversations[targetConversationId]?.chatHistory || [];

        const finalText = await streamChatCompletion(
          apiKey,
          currentHistory,
          controller.signal,
          (delta) =>
            updateUiMessageText(targetConversationId, assistantId, delta),
        );

        pushHistory(targetConversationId, {
          role: "assistant",
          content: finalText || "（未返回内容）",
        });
      } catch (error) {
        let message = "请求失败，请稍后重试。";
        let shouldReplace = true;

        if (error instanceof Error && error.name === "AbortError") {
          removeHistoryMessage(targetConversationId, currentUserMessage);
          const currentText =
            useChatStore
              .getState()
              .conversations[targetConversationId]
              ?.messages.find((item) => item.id === assistantId)?.text || "";

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

          if (typedError.status === 401 || typedError.status === 403) {
            localStorage.removeItem(API_KEY_STORAGE);
            message = `鉴权失败：API Key 无效、过期或无权限。已清除本地 Key，请重新写入 LINGXI_API_KEY 后再发送。${endpointTip}`;
          } else if (typedError.status === 429) {
            message = `请求频率或额度受限（429）。请稍后重试，或检查百炼账户额度。${endpointTip}`;
          } else if (typedError.status === 400 && hasImages) {
            message = `图片识别请求被拒绝（400）。请确认当前账号开通了视觉模型，并检查模型名是否可用。${endpointTip}`;
          } else if (typedError.message?.includes("Failed to fetch")) {
            message = `网络请求失败。若控制台出现 ERR_PROXY_CONNECTION_FAILED，可关闭代理或将 dashscope.aliyuncs.com、dashscope-intl.aliyuncs.com 设为直连后重试。${endpointTip}`;
          } else if (typedError.message) {
            message = `请求失败：${typedError.message}${endpointTip}`;
          }
        }

        if (shouldReplace) {
          updateUiMessageText(targetConversationId, assistantId, message);
        }
      } finally {
        setAbortController(targetConversationId, null);
        setStreaming(targetConversationId, false);
      }
    },
    [
      mode,
      conversationId,
      input,
      isStreaming,
      uploadingImages,
      navigate,
      clearUploadingImages,
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

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
  // 当前页面模式：首页仅负责收集问题并跳转，聊天页才实际发请求。
  mode: "home" | "chat";
  // 输入框当前文本。
  input: string;
  // 当前是否在流式响应中，用于防并发发送。
  isStreaming: boolean;
  // 待发送图片列表。
  uploadingImages: UploadingImage[];
  // 路由跳转函数（首页 prompt 跳转到聊天页）。
  navigate: NavigateFunction;
  // 清理待发送图片。
  clearUploadingImages: () => void;
  // 设置输入框文本。
  setInput: (value: string) => void;
  // 添加 UI 消息。
  addUiMessage: (message: UiMessage) => void;
  // 更新某条 UI 消息文本（流式覆盖）。
  updateUiMessageText: (id: string, text: string) => void;
  // 追加模型上下文历史。
  pushHistory: (message: ApiMessage) => void;
  // 从历史中移除指定消息（用于中断回滚）。
  removeHistoryMessage: (message: ApiMessage) => void;
  // 设置/清空请求控制器。
  setAbortController: (controller: AbortController | null) => void;
  // 设置流式状态。
  setStreaming: (value: boolean) => void;
}

export function useSendMessage({
  mode,
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
}: UseSendMessageParams) {
  const promptForApiKey = (): string => {
    // 当本地缺少 Key 时即时弹窗录入，降低首次使用门槛。
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
      // 首页模式：不请求模型，只把草稿问题带到 /chat 页面触发首条发送。
      if (mode === "home") {
        const prompt = (
          typeof cardPrompt === "string" ? cardPrompt : input
        ).trim();
        const hasImages = uploadingImages.length > 0;
        // 首页支持“文本发送”与“仅图片发送”两种入口。
        if (!prompt && !hasImages) {
          return;
        }

        // 主页跳转到聊天页时保留 uploadingImages，由聊天页首次发送流程消费。
        setInput("");
        navigate("/chat", {
          state: { draftPrompt: prompt, shouldAutoSend: true },
        });
        return;
      }

      // 聊天模式：流式阶段禁止并发发送，避免历史上下文错乱。
      if (isStreaming) {
        return;
      }

      // cardPrompt 优先于输入框内容（用于快捷卡片发送）。
      const rawText = typeof cardPrompt === "string" ? cardPrompt : input;
      const text = rawText.trim();
      const hasImages = uploadingImages.length > 0;
      // 文本和图片都为空时不触发请求。
      if (!text && !hasImages) {
        return;
      }

      let apiKey = ensureApiKey();
      if (!apiKey) {
        // 首次或 Key 被清空时，引导用户输入并立即持久化。
        apiKey = promptForApiKey();
        if (!apiKey) {
          addUiMessage({
            id: uid("assistant"),
            role: "assistant",
            text: "未输入 API Key，本次消息未发送。",
          });
          return;
        }
      }

      // 复制一份图片数组，避免后续 clear 操作影响当前发送快照。
      const images = [...uploadingImages];
      const userDisplayText = text || `（发送了 ${images.length} 张图片）`;

      let userContent: string | MessagePart[];
      try {
        // 在真正发送前完成图片编码，失败则给出即时错误提示。
        userContent = await buildUserMessageContent(text, images);
      } catch (error) {
        addUiMessage({
          id: uid("assistant"),
          role: "assistant",
          text: error instanceof Error ? error.message : "图片处理失败，请重试",
        });
        return;
      }

      addUiMessage({
        id: uid("user"),
        role: "user",
        text: userDisplayText,
        // UI 仅展示图片片段；文本统一由 message.text 呈现。
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
      // 历史消息用于模型上下文，UI 消息用于显示，两者并行维护。
      pushHistory(currentUserMessage);

      setInput("");
      clearUploadingImages();

      const assistantId = uid("assistant");
      // 先插入空的助手消息占位，后续通过 onDelta 实时覆盖。
      addUiMessage({ id: assistantId, role: "assistant", text: "" });

      const controller = new AbortController();
      setAbortController(controller);
      setStreaming(true);

      try {
        // 读取最新历史，确保包含刚写入的 user message。
        const currentHistory = useChatStore.getState().chatHistory;
        const finalText = await streamChatCompletion(
          apiKey,
          currentHistory,
          controller.signal,
          // 流式增量覆盖同一条 assistant 消息，实现“打字中”体验。
          (delta) => updateUiMessageText(assistantId, delta),
        );
        pushHistory({
          role: "assistant",
          content: finalText || "（未返回内容）",
        });
      } catch (error) {
        // 错误分级：中断/鉴权/限流/网络等类型给出可操作提示。
        let message = "请求失败，请稍后重试。";
        let shouldReplace = true;

        if (error instanceof Error && error.name === "AbortError") {
          // 用户手动停止时回滚本轮 user 历史，避免污染后续上下文。
          removeHistoryMessage(currentUserMessage);
          const currentText = useChatStore
            .getState()
            .messages.find((item) => item.id === assistantId)?.text;
          if (currentText?.trim()) {
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

          // 鉴权失败时清理本地 Key，避免后续请求重复失败。
          if (typedError.status === 401 || typedError.status === 403) {
            localStorage.removeItem(API_KEY_STORAGE);
            message = `鉴权失败：API Key 无效、过期或无权限。已清除本地 Key，请重新写入 LINGXI_API_KEY 后再发送。${endpointTip}`;
          } else if (typedError.status === 429) {
            message = `请求频率或额度受限（429）。请稍后重试，或检查百炼账号额度。${endpointTip}`;
          } else if (typedError.status === 400 && hasImages) {
            message = `图片识别请求被拒绝（400）。请确认当前账号开通了视觉模型，并检查模型名是否可用（当前默认 qwen-vl-plus）。${endpointTip}`;
          } else if (typedError.message?.includes("Failed to fetch")) {
            message = `网络请求失败。若控制台出现 ERR_PROXY_CONNECTION_FAILED，可关闭代理或将 dashscope.aliyuncs.com、dashscope-intl.aliyuncs.com 设为直连后重试。${endpointTip}`;
          } else if (typedError.message) {
            message = `请求失败：${typedError.message}${endpointTip}`;
          }
        }

        if (shouldReplace) {
          updateUiMessageText(assistantId, message);
        }
      } finally {
        // 无论成功失败都恢复按钮状态。
        setAbortController(null);
        setStreaming(false);
      }
    },
    [
      mode,
      input,
      clearUploadingImages,
      setInput,
      navigate,
      isStreaming,
      uploadingImages,
      addUiMessage,
      pushHistory,
      removeHistoryMessage,
      setAbortController,
      setStreaming,
      updateUiMessageText,
    ],
  );
}

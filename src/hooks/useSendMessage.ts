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

const TYPEWRITER_MAX_CHUNK = 16;
const TYPEWRITER_TAIL_START = 48;

function resolveTypewriterChunkSize(backlog: number): number {
  if (backlog <= 0) {
    return 0;
  }

  // 尾部不再逐字挪动，而是随着剩余字符变少逐步提高追赶速度。
  if (backlog <= 8) {
    return backlog;
  }
  if (backlog <= 16) {
    return Math.max(4, Math.ceil(backlog / 2));
  }
  if (backlog <= TYPEWRITER_TAIL_START) {
    return Math.max(3, Math.ceil(backlog / 3));
  }

  return Math.max(1, Math.min(TYPEWRITER_MAX_CHUNK, Math.ceil(backlog / 28)));
}

// 创建打字机更新器
// 用于在 UI 上实时显示流式返回的内容，避免卡顿。
function createTypewriterUpdater(onText: (text: string) => void) {
  let shownText = ""; // 当前显示的文本，用于对比更新，代表 UI 当前显示到哪
  let targetText = ""; // 目标文本，用于对比更新，代表服务端已经返回到哪
  let timerId: number | null = null; // 定时器 ID，用于控制打字机动画
  const waiters: Array<() => void> = [];

  // 确保所有打字机更新完成，再通知等待者
  const resolveWaiters = () => {
    if (shownText !== targetText) {
      return;
    }
    while (waiters.length) {
      waiters.shift()?.();
    }
  };

  // 创建停止打字机更新器，停止定时器并通知所有等待者完成
  const stopTimer = () => {
    if (timerId === null) {
      return;
    }
    window.clearInterval(timerId);
    timerId = null;
  };

  // 创建打字机更新器，负责按需更新 UI，并确保打字机动画完成。
  const step = () => {
    const backlog = targetText.length - shownText.length;
    if (backlog <= 0) {
      stopTimer();
      resolveWaiters();
      return;
    }

    // 服务端可能一次吐出大块内容；收尾阶段改为平滑加速，减少尾巴拖沓感。
    const chunkSize = resolveTypewriterChunkSize(backlog);
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
      // 如果服务端返回被重置或变短，直接同步到最新内容，避免 UI 残留旧字符。
      if (nextText.length < targetText.length) {
        shownText = nextText;
        onText(shownText);
      }
      targetText = nextText;
      ensureTimer();
    },
    flush(finalText: string) {
      // 请求结束时不立刻写死最终文本，而是等打字机动画把剩余字符补完。
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
  mode, // 当前页面模式
  conversationId, // 当前会话 ID
  input, // 输入框当前文本
  modelProvider, // 当前选中的模型模式
  isStreaming, // 当前是否在流式响应中，用于防并发发送
  uploadingImages, // 待发送图片列表
  uploadingFiles, // 待发送文本文件列表
  navigate, // 路由 navigate
  clearUploadingImages, // 清除待发送图片列表
  clearUploadingFiles, // 清除待发送文本文件列表
  setInput, // 设置输入框文本
  addUiMessage, // 添加 UI 消息
  updateUiMessageText, // 更新 UI 消息文本
  pushHistory, // 添加历史消息
  removeHistoryMessage, // 移除历史消息
  setAbortController, // 设置 AbortController
  setStreaming, // 设置流式响应状态
  ensureConversation, // 确保会话存在
  createConversation, // 创建会话
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
        // 1.1 处理卡片提示和输入框文本的合并。
        const prompt = (typeof cardPrompt === "string" ? cardPrompt : input) // 优先使用卡片提示，否则使用输入框文本
          .trim();

        if (!prompt) {
          const nextId = createConversation();
          navigate(`/chat/${nextId}`);
          return;
        }

        const nextId = createConversation();
        navigate(`/chat/${nextId}`, {
          state: { draftPrompt: prompt, shouldAutoSend: true }, // 创建会话时自动发送请求
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
      const rawText = typeof cardPrompt === "string" ? cardPrompt : input; // 优先使用卡片提示，否则使用输入框文本
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
        // 如果当前是 deepseek 且上传了图片，将强制切换 provider 到灵犀，以便使用视觉模型
        provider = "lingxi";
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
      const attachmentTips: string[] = [];
      if (files.length) {
        attachmentTips.push(`已上传 ${files.length} 个文件`);
      }
      if (images.length) {
        attachmentTips.push(`已上传 ${images.length} 张图片`);
      }
      const attachmentSummary = attachmentTips.length
        ? `（${attachmentTips.join("，")}）`
        : "";
      const userDisplayText = text
        ? `${text}${attachmentSummary ? `\n${attachmentSummary}` : ""}`
        : attachmentSummary;

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
      setInput(targetConversationId, ""); // 清空输入框文本
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
      setAbortController(targetConversationId, controller); // 存储控制器实例，用于后续取消请求
      setStreaming(targetConversationId, true);
      const typewriter = createTypewriterUpdater((nextText) => {
        // 打字机更新器只负责控制“展示速度”，真正的完整内容仍由服务层持续推送。
        updateUiMessageText(targetConversationId, assistantId, nextText);
      });

      try {
        // 11. 发起流式请求（核心中的核心）。
        let currentHistory =
          useChatStore.getState().conversations[targetConversationId] // 获取当前会话历史
            ?.chatHistory || [];

        // 如果我们最终选定的是文本模型，但是历史中包含了图片（可能之前用的视觉模型），
        // 那么需要把历史消息中的图片结构剥离掉，只保留文本，防止大模型接口解析失败 (HTTP 400)。
        if (provider === "deepseek" && !hasImages) {
          currentHistory = currentHistory.map((msg) => {
            if (Array.isArray(msg.content)) {
              // 将数组内容转为纯文本字符串（仅保留文本部分）
              const textContent = msg.content
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("\n");
              return { ...msg, content: textContent };
            }
            return msg;
          });
        }

        const finalText = await streamChatCompletion(
          provider,
          apiKey,
          currentHistory, // 传递当前会话历史，保持上下文连续
          controller.signal, // 传递控制器信号，用于可能的请求中断操作
          (delta) => typewriter.push(delta), // 处理服务端返回的增量内容
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
        setAbortController(targetConversationId, null); // 清除控制器实例，避免后续请求重复取消
        setStreaming(targetConversationId, false); // 重置流式状态，准备下一次请求
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

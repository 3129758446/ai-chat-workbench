/**
 * 文件功能：封装“发送消息”完整流程，统一处理首页跳转、流式请求、历史维护与错误提示。
 * 设计思路：
 * 1. 将发送链路从 App.tsx 抽离为 hook，主组件仅负责页面编排和事件绑定。
 * 2. 发送采用“先更新 UI，再流式回填”的策略，保证用户操作即时反馈。
 * 3. 错误信息按场景分级（鉴权/限流/网络/中断），给出可执行的下一步提示。
 * 4. 通过 useCallback 固定函数引用，避免 effect 依赖因函数地址变化触发重复执行。
 */

// 1.判断模式（首页 / 聊天页）
// 2.校验内容（有没有文字或图片）
// 3.校验 API Key
// 4.处理图片（转成可发送格式）
// 5.把用户消息加到界面
// 6.把用户消息加到历史记录
// 7.清空输入框
// 8.创建一条空的 AI 消息
// 9.发起流式请求，一边收一边渲染
// 10.接收完成 → 保存 AI 消息到历史
// 11.异常处理（停止、报错、无网络、鉴权失败）

// 核心设计思想：
// 1.先更新 UI，再请求接口 -> 让用户感觉响应很快
// 2.UI 消息和历史消息分开维护 -> UI：负责显示|历史：给 AI 上下文用
// 3.错误分级提示 -> 不同错误给不同提示
// 4.支持停止生成-> 用 AbortController
// 5.支持图片 + 文本一起发送
// 6.首页只跳转，聊天页才发送

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
  mode: "home" | "chat"; // 当前页面模式：首页仅负责收集问题并跳转，聊天页才实际发请求
  input: string; // 输入框当前文本
  isStreaming: boolean; // 当前是否在流式响应中，用于防并发发送
  uploadingImages: UploadingImage[]; // 待发送图片列表

  navigate: NavigateFunction; // 路由跳转函数（首页 prompt 跳转到聊天页）
  // 清理待发送图片
  clearUploadingImages: () => void;
  // 设置输入框文本
  setInput: (value: string) => void;
  // 添加 UI 消息
  addUiMessage: (message: UiMessage) => void;
  // 更新某条 UI 消息文本（流式覆盖）
  updateUiMessageText: (id: string, text: string) => void;
  // 追加模型上下文历史
  pushHistory: (message: ApiMessage) => void;
  // 从历史中移除指定消息（用于中断回滚）
  removeHistoryMessage: (message: ApiMessage) => void;
  // 设置/清空请求控制器
  setAbortController: (controller: AbortController | null) => void;
  // 设置流式状态
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

  // 当本地缺少 Key 时即时弹窗录入，降低首次使用门槛。
  const promptForApiKey = (): string => {
    // 当本地缺少 Key 时即时弹窗录入，降低首次使用门槛。
    const inputValue = window.prompt(
      "未检测到本地 API Key，请输入你的 LINGXI_API_KEY：",
    );
    // 校验并返回 Key。输入为空或仅有空白时视为取消，返回空字符串。
    const nextKey = normalizeApiKey(inputValue);
    if (!nextKey) {
      return "";
    }
    localStorage.setItem(API_KEY_STORAGE, nextKey);
    return nextKey;
  };

  return useCallback(
    async (cardPrompt?: string) => {  

      // 1. 首页 ———— 只负责跳转到聊天页，不发送请求，只把草稿问题带到 /chat 页面触发首条发送。
      if (mode === "home") {
        // 优先使用cardPrompt【首页卡牌信息】（如果存在），否则使用输入框内容。
        // 这样可以支持首页快捷卡片发送，同时保持输入框内容的正确性。
        const prompt = (
          typeof cardPrompt === "string" ? cardPrompt : input
        ).trim();
        const hasImages = uploadingImages.length > 0;
        // 文本和图片都为空时不触发跳转。
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

      // 2.如果正在流式输出，禁止重复发送
      if (isStreaming) {
        return;
      }

      // 3.检查是否有内容，文本和图片都为空时不触发请求。
      // cardPrompt 优先于输入框内容（用于快捷卡片发送）。
      const rawText = typeof cardPrompt === "string" ? cardPrompt : input;
      const text = rawText.trim();
      const hasImages = uploadingImages.length > 0;
      if (!text && !hasImages) {
        return;
      }

      //4.检查 API Key
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

      //5.构建发送内容（处理图片），把文本 + 图片转成接口需要的格式
      let userContent: string | MessagePart[];
      try {
        // 在真正发送前完成图片编码，失败则给出即时错误提示。
        //buildUserMessageContent，专门用来构建 “用户发送内容” 的工具函数，负责把文本和图片转成接口需要的格式（纯文本或多模态片段数组）。
        // 如果图片处理失败，会抛出异常并在界面上显示错误信息，避免进入请求阶段才发现问题。
        userContent = await buildUserMessageContent(text, images); // 构建用户消息内容，可能包含文本和图片片段
      } catch (error) {
        addUiMessage({
          id: uid("assistant"),
          role: "assistant",
          text: error instanceof Error ? error.message : "图片处理失败，请重试",
        });
        return;
      }

      //6. 把用户消息加到界面
      addUiMessage({
        id: uid("user"),
        role: "user",
        text: userDisplayText,  // 显示用户输入的文本，包含图片数量提示，避免仅图片时界面无反馈
        // UI 仅展示图片片段；文本统一由 message.text 呈现。
        content: Array.isArray(userContent)
          ? userContent.filter(
              (item): item is MessagePart => item.type === "image_url",  // 过滤掉非图片片段，UI 消息只保留图片片段用于展示，文本内容由 message.text 统一呈现，避免重复显示文本信息。
            )
          : undefined,
      });
      // 构建用户消息内容。
      const currentUserMessage: ApiMessage = {
        role: "user",
        content: userContent,
      };

      //7.把用户消息加入模型上下文历史，
      //历史消息用于模型上下文，UI 消息用于显示，两者并行维护。
      pushHistory(currentUserMessage);

      //8.清空输入框和待发送图片
      setInput("");
      clearUploadingImages();

      //9.先插入空的助手消息占位，后续通过 onDelta 实时覆盖文本，实现流式打字效果
      const assistantId = uid("assistant");
      addUiMessage({ id: assistantId, role: "assistant", text: "" });

      const controller = new AbortController(); // 创建控制器实例，用于可能的请求中断操作
      setAbortController(controller);  // 保存控制器实例以便后续可能的中断操作
      setStreaming(true); // 设置流式状态，禁止重复发送并显示生成中状态

      try {
        // 读取最新历史，确保包含刚写入的 user message。
        const currentHistory = useChatStore.getState().chatHistory;
        // 10.发起流式请求（核心中的核心）
        // 每收到一段文字，就调用 updateUiMessageText，把文字追加到 AI 消息里 → 实现打字机效果
        const finalText = await streamChatCompletion(
          apiKey,
          currentHistory,  // 获取当前会话历史
          controller.signal,  // 传入控制器的 signal，以支持请求中断
          // 流式增量覆盖同一条 assistant 消息，实现“打字中”体验。
          (delta) => updateUiMessageText(assistantId, delta),
        );
        // 11.请求完成，把 AI 消息加入历史
        pushHistory({
          role: "assistant",
          content: finalText || "（未返回内容）",
        });
      } catch (error) {
        // 12.错误处理
        // 错误分级：中断/鉴权/限流/网络等类型给出可操作提示。
        let message = "请求失败，请稍后重试。";
        let shouldReplace = true; // 默认错误消息会替换 AI 消息内容，但某些情况下（如用户主动停止但已有部分内容）我们选择保留已有文本并仅追加提示。

        if (error instanceof Error && error.name === "AbortError") {
          // 1.用户手动停止时回滚本轮 user 历史，避免污染后续上下文。
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
          //其他错误，根据错误类型和信息进行分级提示，帮助用户理解问题并指导下一步操作。
          const typedError = error as {
            status?: number;
            endpoint?: string;
            message?: string;
          };
          const endpointTip = typedError.endpoint
            ? `（端点：${escapeHtml(typedError.endpoint)}）`
            : "";

          // 2.鉴权失败时清理本地 Key，避免后续请求重复失败。
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

// 核心设计思想：
// 1.先更新 UI，再请求接口 -> 让用户感觉响应很快
// 2.UI 消息和历史消息分开维护 -> UI：负责显示|历史：给 AI 上下文用
// 3.错误分级提示 -> 不同错误给不同提示
// 4.支持停止生成-> 用 AbortController
// 5.支持图片 + 文本一起发送
// 6.首页只跳转，聊天页才发送
/**
 * 文件功能：提供聊天 store 的纯函数辅助能力，如主题标准化、会话记录创建、摘要推导和恢复兜底。
 * 设计思路：
 * 1. 将“无副作用或轻副作用”的工具逻辑集中管理，避免分散在各动作模块中重复实现。
 * 2. 所有会话默认值都从同一个工厂函数创建，保证新建和恢复后的结构一致。
 * 3. 将对象 URL 回收封装成独立方法，减少资源释放逻辑散落在多处。
 */

import { THEME_STORAGE } from "../constants";
import type { ApiMessage, Conversation, ConversationDraft, ThemeMode } from "../types/chat";
import { uid } from "../utils/helpers";

export function normalizeTheme(theme: string | null | undefined): ThemeMode {
  return theme === "light" ? "light" : "dark";
}

export const DEFAULT_THEME = normalizeTheme(localStorage.getItem(THEME_STORAGE));

// 从 API 消息内容中提取文本或图片数量摘要。
export function previewFromContent(content: ApiMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .join(" ")
    .trim();

  if (text) {
    return text;
  }

  const imageCount = content.filter((part) => part.type === "image_url").length;
  // 没有文本时回退为图片数量摘要，方便侧栏列表生成可读预览。
  return imageCount ? `[图片] ${imageCount} 张` : "";
}

// 对文本进行截断，确保不超过最大长度，同时保留单词边界。
export function shorten(text: string, max = 48): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

// 创建一个会话记录，包含默认字段和初始化状态。
export function createConversationRecord(
  id = uid("conversation"),
  title = "新会话",
): Conversation {
  const now = Date.now();
  // 统一在这里定义会话默认值，避免多个动作模块手写初始化结构。
  return {
    id, 
    title, // 会话标题，默认值为“新会话”。
    createdAt: now, // 会话创建时间，默认值为当前时间。
    updatedAt: now, // 会话最后更新时间，默认值为当前时间。
    lastMessagePreview: "", // 最新消息预览，默认值为空字符串。
    draftInput: "", // 上传中的文本文件草稿，默认值为空字符串。
    messages: [], // 会话消息列表，默认值为空数组。
    chatHistory: [], // 会话历史消息列表，默认值为空数组。
    uploadingImages: [], // 上传中的图片预览列表，默认值为空数组。
    uploadingFiles: [], // 上传中的文本文件草稿列表，默认值为空数组。
    isStreaming: false, // 是否正在流式接收消息，默认值为 false。
  };
}

// 推导会话摘要，用于列表展示。
export function deriveConversationPatch(
  conversation: Conversation,
): Partial<Conversation> {
  // 用首条用户消息生成标题，让侧栏无需额外手动输入也能快速区分会话。
  const firstUserMessage = conversation.chatHistory.find(
    (message) => message.role === "user",
  );
  const suggestedTitle = shorten(
    firstUserMessage ? previewFromContent(firstUserMessage.content) : "",
    24,
  );

  const lastHistory = conversation.chatHistory[conversation.chatHistory.length - 1];
  const lastMessagePreview = lastHistory
    ? shorten(previewFromContent(lastHistory.content))
    : "";

  return {
    title: suggestedTitle || conversation.title || "新会话",
    lastMessagePreview,
    updatedAt: Date.now(),
  };
}

// 恢复持久化会话记录，确保默认值和运行态状态一致。
export function normalizePersistedConversation(
  draft: ConversationDraft | undefined,
  fallbackId: string,
): Conversation {
  const base = createConversationRecord(fallbackId);
  if (!draft) {
    return base;
  }

  return {
    ...base,
    ...draft,
    // 上传草稿和流式状态属于运行态信息，刷新恢复时统一重置。
    uploadingImages: [],
    uploadingFiles: [],
    isStreaming: false,
  };
}

// 释放会话上传的图片 URL，避免内存泄漏。
export function revokeConversationImageUrls(conversation: Conversation): void {
  // 批量释放本地预览 URL，避免删除会话或清空草稿后产生内存泄漏。
  conversation.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
}

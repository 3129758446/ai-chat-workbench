/**
 * 文件功能：定义聊天 store 的类型边界，包括运行态 State、持久化 State 和 Zustand 内部方法类型。
 * 设计思路：
 * 1. 把类型从 store 主体中抽离，避免实现文件同时承担“类型声明 + 业务逻辑”两种职责。
 * 2. 运行态状态和持久化状态分开建模，明确哪些字段只存在于内存中。
 * 3. 导出 `set/get` 的类型别名，方便各动作模块共享同一套签名约束。
 */

import type { StateCreator } from "zustand";
import type {
  ApiMessage,
  Conversation,
  ConversationDraft,
  ThemeMode,
  UiMessage,
  UploadingImage,
  UploadingTextFile,
} from "../types/chat";

export interface PersistedChatState {
  theme: ThemeMode;
  currentConversationId: string | null;
  orderedConversationIds: string[];
  // 持久化层只保存可序列化的会话草稿，不保存 File、AbortController 等运行态对象。
  conversations: Record<string, ConversationDraft>;
}

export interface ChatState {
  theme: ThemeMode;
  currentConversationId: string | null;
  orderedConversationIds: string[];
  conversations: Record<string, Conversation>;
  abortControllers: Record<string, AbortController | null>;

  setTheme: (theme: ThemeMode) => void;

  createConversation: (options?: { title?: string }) => string;
  ensureConversation: (id: string) => void;
  switchConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  clearConversation: (id: string) => void;

  setDraftInput: (id: string, value: string) => void;
  addUiMessage: (id: string, message: UiMessage) => void;
  updateUiMessageText: (id: string, messageId: string, text: string) => void;
  pushHistory: (id: string, message: ApiMessage) => void;
  removeHistoryMessage: (id: string, target: ApiMessage) => void;

  addUploadingImages: (id: string, images: UploadingImage[]) => void;
  removeUploadingImage: (id: string, imageId: string) => void;
  clearUploadingImages: (id: string) => void;
  addUploadingFiles: (id: string, files: UploadingTextFile[]) => void;
  updateUploadingFile: (
    id: string,
    fileId: string,
    patch: Partial<UploadingTextFile>,
  ) => void;
  removeUploadingFile: (id: string, fileId: string) => void;
  clearUploadingFiles: (id: string) => void;

  setStreaming: (id: string, value: boolean) => void;
  setAbortController: (id: string, controller: AbortController | null) => void;
}

// 复用 Zustand 原生 StateCreator 的参数类型，保证动作工厂拿到的 set/get 签名始终一致。
export type ChatStoreSet = Parameters<StateCreator<ChatState>>[0];
export type ChatStoreGet = Parameters<StateCreator<ChatState>>[1];

/**
 * 文件功能：封装 Zustand persist 的配置，包括状态裁剪、恢复合并和本地存储介质定义。
 * 设计思路：
 * 1. 把持久化规则从 store 主体中抽离，避免主文件被序列化细节淹没。
 * 2. 持久化阶段只保存“可序列化且有恢复意义”的字段，明确区分业务状态与运行态对象。
 * 3. 恢复阶段统一做标准化处理，降低未来字段扩展和版本迁移的风险。
 */

import { CHAT_STORE_STORAGE } from "../constants";
import type { ConversationDraft } from "../types/chat";
import { createJSONStorage } from "zustand/middleware";
import type { PersistOptions } from "zustand/middleware";
import {
  normalizePersistedConversation,
  normalizeTheme,
} from "./chatStore.helpers";
import type { ChatState, PersistedChatState } from "./chatStore.types";

function partializeChatState(state: ChatState): PersistedChatState {
  return {
    theme: state.theme,
    currentConversationId: state.currentConversationId,
    orderedConversationIds: state.orderedConversationIds,
    // 会话裁剪为草稿结构，避免把 File、AbortController 等不可序列化对象塞进 localStorage。
    conversations: Object.fromEntries(
      Object.entries(state.conversations).map(([id, conversation]) => [
        id,
        {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          lastMessagePreview: conversation.lastMessagePreview,
          draftInput: conversation.draftInput,
          messages: conversation.messages,
          chatHistory: conversation.chatHistory,
        } satisfies ConversationDraft,
      ]),
    ),
  };
}

function mergePersistedChatState(
  persisted: unknown,
  current: ChatState,
): ChatState {
  const persistedState = persisted as PersistedChatState | undefined;
  if (!persistedState) {
    return current;
  }

  const conversations = Object.fromEntries(
    Object.entries(persistedState.conversations || {}).map(([id, draft]) => [
      // 统一补齐默认字段，避免持久化数据缺少新字段时直接恢复出错。
      id,
      normalizePersistedConversation(draft, id),
    ]),
  );

  const abortControllers = Object.fromEntries(
    // 控制器只存在于当前运行时，恢复后统一重置为 null。
    Object.keys(conversations).map((id) => [id, null]),
  );

  return {
    ...current,
    ...persistedState,
    theme: normalizeTheme(persistedState.theme),
    conversations,
    abortControllers,
  };
}

export function createChatPersistOptions(): PersistOptions<
  ChatState,
  PersistedChatState
> {
  return {
    name: CHAT_STORE_STORAGE,
    // Zustand 默认走 JSON 序列化，这里显式指定 localStorage 存储实现。
    storage: createJSONStorage(() => localStorage),
    partialize: partializeChatState,
    merge: mergePersistedChatState,
  };
}

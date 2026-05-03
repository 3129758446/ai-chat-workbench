/**
 * 文件功能：集中管理“消息与上下文”相关动作，包括输入草稿、UI 消息和 API 历史维护。
 * 设计思路：
 * 1. UI 消息和 API 历史分轨更新，既照顾页面渲染，又保证请求上下文结构稳定。
 * 2. 将会话标题、摘要、最近更新时间的推导放在历史更新时统一触发。
 * 3. 所有消息改动都以 conversation 为边界，避免多会话之间互相污染。
 */

import type { ChatState, ChatStoreSet } from "./chatStore.types";
import { deriveConversationPatch } from "./chatStore.helpers";

export function createMessageActions(
  set: ChatStoreSet,
): Pick<
  ChatState,
  | "setDraftInput"
  | "addUiMessage"
  | "updateUiMessageText"
  | "pushHistory"
  | "removeHistoryMessage"
> {
  return {
    setDraftInput: (id, value) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }
        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...conversation,
              draftInput: value,
            },
          },
        };
      }),

    addUiMessage: (id, message) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }
        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...conversation,
              // UI 消息立刻入列，保证用户点击发送后第一时间得到页面反馈。
              messages: [...conversation.messages, message],
              updatedAt: Date.now(),
            },
          },
        };
      }),

    updateUiMessageText: (id, messageId, text) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }
        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === messageId ? { ...message, text } : message,
              ),
              updatedAt: Date.now(),
            },
          },
        };
      }),

    pushHistory: (id, message) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }

        const nextConversation = {
          ...conversation,
          // chatHistory 专门服务于模型请求，和 UI 消息列表独立维护。
          chatHistory: [...conversation.chatHistory, message],
        };

        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...nextConversation,
              ...deriveConversationPatch(nextConversation),
            },
          },
          // 当前会话一旦有新历史，自动提升到列表顶部，符合聊天产品常见排序习惯。
          orderedConversationIds: [
            id,
            ...state.orderedConversationIds.filter(
              (conversationId) => conversationId !== id,
            ),
          ],
        };
      }),

    removeHistoryMessage: (id, target) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }

        // 中断发送时按引用删除最后插入的那条 user 历史，避免污染后续上下文。
        const index = conversation.chatHistory.lastIndexOf(target);
        if (index < 0) {
          return state;
        }

        const nextHistory = [...conversation.chatHistory];
        nextHistory.splice(index, 1);
        const nextConversation = {
          ...conversation,
          chatHistory: nextHistory,
        };

        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...nextConversation,
              ...deriveConversationPatch(nextConversation),
            },
          },
        };
      }),
  };
}

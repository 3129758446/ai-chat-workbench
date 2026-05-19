/**
 * 文件功能：集中管理“会话实体”相关动作，包括创建、确保存在、切换、重命名、删除和清空。
 * 设计思路：
 * 1. 将会话生命周期操作单独收口，便于后续继续扩展搜索、归档、置顶等能力。
 * 2. 会话操作不直接耦合消息发送逻辑，只负责维护会话字典、排序列表和当前指针。
 * 3. 删除/清空会话时同时处理资源回收和请求中断，保证状态与运行时一致。
 */

import type { ChatState, ChatStoreGet, ChatStoreSet } from "./chatStore.types";
import {
  createConversationRecord,
  revokeConversationImageUrls,
} from "./chatStore.helpers";

export function createConversationActions(
  set: ChatStoreSet,
  get: ChatStoreGet,
): Pick<
  ChatState,
  | "createConversation"
  | "ensureConversation"
  | "switchConversation"
  | "renameConversation"
  | "deleteConversation"
  | "clearConversation"
> {
  return {
    createConversation: (options) => {
      const conversation = createConversationRecord(undefined, options?.title);
      set((state) => ({
        // 新会话默认插到顶部，保持“最近活跃优先”的侧栏顺序。
        currentConversationId: conversation.id,
        orderedConversationIds: [conversation.id, ...state.orderedConversationIds],
        conversations: {
          ...state.conversations,
          [conversation.id]: conversation,
        },
        // 新会话尚无生成请求，预设一个空占位，便于后续状态更新和请求中断逻辑统一处理。
        abortControllers: {
          ...state.abortControllers,
          [conversation.id]: null,
        },
      }));
      return conversation.id;
    },

    ensureConversation: (id) => {
      const existing = get().conversations[id];
      if (existing) {
        if (get().currentConversationId !== id) {
          // 路由直达或刷新恢复时，只需要把当前指针切到目标会话即可。
          set({ currentConversationId: id });
        }
        return;
      }

      const conversation = createConversationRecord(id);
      set((state) => ({
        currentConversationId: id,
        // 保证通过路由打开一个不存在的会话时，也能立即补出基础记录。
        orderedConversationIds: state.orderedConversationIds.includes(id)
          ? state.orderedConversationIds
          : [id, ...state.orderedConversationIds],
        conversations: {
          ...state.conversations,
          [id]: conversation,
        },
        abortControllers: {
          ...state.abortControllers,
          [id]: null,
        },
      }));
    },

    switchConversation: (id) => {
      if (!get().conversations[id]) {
        // 如果目标会话尚未建档，则先补建再切换，避免页面出现空引用。
        get().ensureConversation(id);
        return;
      }
      set({ currentConversationId: id });
    },

    renameConversation: (id, title) =>
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
              title: title.trim() || conversation.title,
              updatedAt: Date.now(),
            },
          },
        };
      }),

    deleteConversation: (id) =>
      set((state) => {
        const nextConversations = { ...state.conversations };
        const target = nextConversations[id];
        if (!target) {
          return state;
        }

        // 删除会话前先释放预览图 URL，避免浏览器保留无效 Blob 引用。
        revokeConversationImageUrls(target);
        delete nextConversations[id];

        const nextAbortControllers = { ...state.abortControllers };
        // 如果该会话仍在生成中，删除时同步中止请求。
        nextAbortControllers[id]?.abort();
        delete nextAbortControllers[id];

        const nextOrderedIds = state.orderedConversationIds.filter(
          (conversationId) => conversationId !== id,
        );
        const nextCurrentId =
          state.currentConversationId === id
            ? nextOrderedIds[0] || null
            : state.currentConversationId;

        return {
          currentConversationId: nextCurrentId,
          orderedConversationIds: nextOrderedIds,
          conversations: nextConversations,
          abortControllers: nextAbortControllers,
        };
      }),

    clearConversation: (id) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }

        // 清空并不删除会话壳，只重置内容，便于保留侧栏定位和标题语义。
        revokeConversationImageUrls(conversation);

        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...createConversationRecord(id, conversation.title),
              createdAt: conversation.createdAt,
            },
          },
          abortControllers: {
            ...state.abortControllers,
            [id]: null,
          },
        };
      }),
  };
}

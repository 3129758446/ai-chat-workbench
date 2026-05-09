/**
 * 文件功能：多会话聊天状态中心（Zustand），统一管理 UI 状态、会话状态与持久化。
 * 设计思路：
 * 1. 将状态定义、动作分组、辅助函数、持久化配置拆分到独立模块，降低单文件复杂度。
 * 2. `chatStore.ts` 只负责组合初始状态与各功能组，形成统一的 store 入口。
 * 3. 对外仍然保持同一套 store API，避免业务层调用方式发生变化。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createConversationActions } from "./chatStore.conversations";
import { DEFAULT_THEME } from "./chatStore.helpers";
import { createMessageActions } from "./chatStore.messages";
import { createChatPersistOptions } from "./chatStore.persistence";
import { createRuntimeActions } from "./chatStore.runtime";
import type { ChatState } from "./chatStore.types";
import { createUploadActions } from "./chatStore.uploads";

// 创建聊天状态中心
// 组合初始状态与各功能组，形成统一的 store 入口。
export const useChatStore = create<ChatState>()(
  persist( // 开启状态持久化
    (set, get) => ({
      theme: DEFAULT_THEME,
      modelProvider: "auto",
      currentConversationId: null,
      orderedConversationIds: [],
      conversations: {},
      abortControllers: {},

      // 先组合运行态动作，再组合会话、消息、上传动作，保持模块边界清晰。
      ...createRuntimeActions(set), // 运行态动作，如主题切换、模型选择等
      ...createConversationActions(set, get), // 会话动作，如创建、切换、删除会话等
      ...createMessageActions(set), // 消息动作，如添加、删除、更新消息等
      ...createUploadActions(set), // 上传动作，如添加、删除、更新上传文件等
    }), 
    // persist 规则单独收口，主文件只负责装配。
    createChatPersistOptions(), // 配置状态持久化规则，如本地存储、服务器端存储等
  ),
);

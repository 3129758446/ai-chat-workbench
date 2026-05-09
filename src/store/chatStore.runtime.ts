/**
 * 文件功能：集中管理运行态动作，包括主题、流式状态和请求控制器。
 * 设计思路：
 * 1. 这些状态和“会话内容”不同，更偏运行时控制，因此单独分组更清晰。
 * 2. 主题既要更新 store，也要同步本地存储，所以放在统一入口维护。
 * 3. 流式状态和 AbortController 只在内存里生效，不进入持久化层。
 */

import { THEME_STORAGE } from "../constants";
import type { ChatState, ChatStoreSet } from "./chatStore.types";

// 创建运行态动作函数，用于更新主题、模型选择、流式状态和请求控制器。
export function createRuntimeActions(
  set: ChatStoreSet,
): Pick<
  ChatState,
  "setTheme" | "setModelProvider" | "setStreaming" | "setAbortController"
> {
  return {
    setTheme: (theme) => {
      // 主题属于用户偏好，切换时同步写入 localStorage，刷新后可恢复。
      localStorage.setItem(THEME_STORAGE, theme);
      set({ theme });
    },

    setModelProvider: (provider) => {
      // 模型选择属于用户偏好，和主题一样进入持久化状态，刷新后继续沿用。
      set({ modelProvider: provider });
    },

    setStreaming: (id, value) =>
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
              // isStreaming 直接驱动发送按钮、停止按钮和最后一条消息的打字效果。
              isStreaming: value,
            },
          },
        };
      }),

    setAbortController: (id, controller) =>
      set((state) => ({
        abortControllers: {
          ...state.abortControllers,
          // 每个会话单独记录控制器，才能做到按会话停止流式请求。
          [id]: controller,
        },
      })),
  };
}

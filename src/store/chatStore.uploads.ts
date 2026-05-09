/**
 * 文件功能：集中管理上传草稿相关动作，包括图片预览、文本文件草稿和清理逻辑。
 * 设计思路：
 * 1. 上传资源只属于当前会话，不进入全局共享列表，保证多会话草稿隔离。
 * 2. 图片与文本文件拆成两套动作，但都通过同一份 conversation 状态承载。
 * 3. 图片相关动作内聚对象 URL 的释放逻辑，减少预览资源泄漏风险。
 */

import type { ChatState, ChatStoreSet } from "./chatStore.types";

export function createUploadActions(
  set: ChatStoreSet,
): Pick<
  ChatState,
  | "addUploadingImages"
  | "removeUploadingImage"
  | "clearUploadingImages"
  | "addUploadingFiles"
  | "updateUploadingFile"
  | "removeUploadingFile"
  | "clearUploadingFiles"
> {
  return {
    // 添加上传中的图片预览到会话记录。
    addUploadingImages: (id, images) =>
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
              uploadingImages: [...conversation.uploadingImages, ...images],
            },
          },
        };
      }),

      // 删除上传中的图片预览。
    removeUploadingImage: (id, imageId) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }

        const target = conversation.uploadingImages.find(
          (item) => item.id === imageId,
        );
        if (target) {
          // 移除单张预览图时立即回收 URL，避免切换多次图片后内存持续增长。
          URL.revokeObjectURL(target.url);
        }

        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...conversation,
              uploadingImages: conversation.uploadingImages.filter(
                (item) => item.id !== imageId,
              ),
            },
          },
        };
      }),

      // 清空上传中的图片预览。
    clearUploadingImages: (id) =>
      set((state) => {
        const conversation = state.conversations[id];
        if (!conversation) {
          return state;
        }

        // 清空草稿前先统一释放所有对象 URL。
        conversation.uploadingImages.forEach((item) =>
          URL.revokeObjectURL(item.url),
        );

        return {
          conversations: {
            ...state.conversations,
            [id]: {
              ...conversation,
              uploadingImages: [],
            },
          },
        };
      }),

      // 添加上传中的文本文件草稿到会话记录。
    addUploadingFiles: (id, files) =>
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
              uploadingFiles: [...conversation.uploadingFiles, ...files],
            },
          },
        };
      }),

      // 更新上传中的文本文件草稿。
    updateUploadingFile: (id, fileId, patch) =>
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
              // 解析中文件会经历 parsing -> ready/error 的状态流转，这里统一做补丁更新。
              uploadingFiles: conversation.uploadingFiles.map((file) =>
                file.id === fileId ? { ...file, ...patch } : file,
              ),
            },
          },
        };
      }),

      // 删除上传中的文本文件草稿。
    removeUploadingFile: (id, fileId) =>
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
              uploadingFiles: conversation.uploadingFiles.filter(
                (file) => file.id !== fileId,
              ),
            },
          },
        };
      }),

      // 清空上传中的文本文件草稿。
    clearUploadingFiles: (id) =>
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
              uploadingFiles: [],
            },
          },
        };
      }),
  };
}

/**
 * 文件功能：全局聊天状态中心（Zustand），统一管理 UI 状态与会话状态。
 * 设计思路：
 * 1. 把“可跨组件共享且会频繁变化”的状态集中管理，减少 props drilling。
 * 2. 将状态与操作方法放在同一个 store，便于形成可追踪的数据流。
 * 3. UI 展示消息与 API 历史消息分轨存储，既保证展示灵活性又保证请求正确性。
 * 4. 上传图片 URL 的释放逻辑放入 store，避免资源管理散落在多处。
 */

import { create } from "zustand";
import { THEME_STORAGE } from "../constants";
import type {
  ApiMessage,
  ThemeMode,
  UiMessage,
  UploadingImage,
} from "../types/chat";

interface ChatState {
  // 输入框当前文本。
  input: string;
  // 主题模式（用于 body data-theme 与图标切换）。
  theme: ThemeMode;
  // 当前是否处于流式响应阶段。
  isStreaming: boolean;
  // 正在进行请求的控制器，用于中止生成。
  abortController: AbortController | null;
  // 页面渲染用消息。
  messages: UiMessage[];
  // 发给模型的历史消息。
  chatHistory: ApiMessage[];
  // 待发送图片列表。
  uploadingImages: UploadingImage[];
  setInput: (value: string) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setStreaming: (value: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  addUiMessage: (message: UiMessage) => void;
  updateUiMessageText: (id: string, text: string) => void;
  pushHistory: (message: ApiMessage) => void;
  removeHistoryMessage: (message: ApiMessage) => void;
  clearConversation: () => void;
  addUploadingImages: (images: UploadingImage[]) => void;
  removeUploadingImage: (id: string) => void;
  clearUploadingImages: () => void;
}

// Store 初始化：提供状态初值和业务动作。
export const useChatStore = create<ChatState>((set) => ({
  input: "",
  theme: (localStorage.getItem(THEME_STORAGE) as ThemeMode) || "dark",
  isStreaming: false,
  abortController: null,
  messages: [],
  chatHistory: [],
  uploadingImages: [],

  setInput: (value) => set({ input: value }),
  // 主题切换写入 localStorage，保持刷新后偏好一致。
  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE, theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const nextTheme: ThemeMode = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE, nextTheme);
      return { theme: nextTheme };
    }),
  setStreaming: (value) => set({ isStreaming: value }),
  setAbortController: (controller) => set({ abortController: controller }),

  // 追加一条 UI 消息。
  addUiMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  // 流式过程中按消息 ID 覆盖内容。
  updateUiMessageText: (id, text) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, text } : message,
      ),
    })),

  // 历史消息顺序追加，用于保留模型上下文。
  pushHistory: (message) =>
    set((state) => ({
      chatHistory: [...state.chatHistory, message],
    })),
  // 中断流式时移除当轮用户消息，防止历史污染后续回答。
  removeHistoryMessage: (target) =>
    set((state) => {
      const index = state.chatHistory.lastIndexOf(target);
      if (index < 0) {
        return state;
      }
      const next = [...state.chatHistory];
      next.splice(index, 1);
      return { chatHistory: next };
    }),

  // 清空会话时统一释放上传预览 URL，防止内存泄漏。
  clearConversation: () =>
    set((state) => {
      state.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
      return {
        input: "",
        isStreaming: false,
        abortController: null,
        messages: [],
        chatHistory: [],
        uploadingImages: [],
      };
    }),

  // 批量加入用户选择的待发送图片。
  addUploadingImages: (images) =>
    set((state) => ({
      uploadingImages: [...state.uploadingImages, ...images],
    })),
  // 删除单张待发送图片并释放对应 URL。
  removeUploadingImage: (id) =>
    set((state) => {
      const target = state.uploadingImages.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return {
        uploadingImages: state.uploadingImages.filter((item) => item.id !== id),
      };
    }),
  // 清空当前待发送图片。
  clearUploadingImages: () =>
    set((state) => {
      state.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
      return { uploadingImages: [] };
    }),
}));

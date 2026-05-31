/**
 * 文件功能：集中管理 App 页面级副作用（主题同步、输入框高度、滚动、资源清理）。
 * 设计思路：
 * 1. 将“和渲染无关但必须发生”的 effect 从 App.tsx 拆出，降低主组件复杂度。
 * 2. 以参数形式注入依赖状态，hook 保持纯编排，不持有额外业务状态。
 * 3. 把 URL 释放逻辑统一放在清理阶段，避免对象 URL 泄漏造成内存增长。
 */

import { useEffect } from "react";
import type { RefObject } from "react";
import type {
  ThemeMode,
  UiMessage,
  UploadingImage,
  UploadingTextFile,
} from "../types/chat";
import { useChatStore } from "../store";
import { scrollToBottom } from "../utils/helpers";

interface UseAppEffectsParams {
  theme: ThemeMode;
  mode: "home" | "chat";
  activeConversationId: string | null;
  messagesCount: number;
  isStreaming: boolean;
  input: string;
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
  messages: UiMessage[];
  uploadingImages: UploadingImage[];
  uploadingFiles: UploadingTextFile[];
}

export function useAppEffects({
  theme,
  mode,
  activeConversationId,
  messagesCount,
  isStreaming,
  input,
  messageInputRef,
  messages,
  uploadingImages,
  uploadingFiles,
}: UseAppEffectsParams) {
  // 主题同步：更新 body data-theme 和聊天激活态 class，同时切换高亮 CSS。
  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.classList.toggle(
      "chat-active",
      mode === "chat" && messagesCount > 0,
    );
    document.body.classList.toggle("chat-layout", true);

    const darkCss = document.getElementById(
      "hljs-theme-dark",
    ) as HTMLLinkElement | null;
    const lightCss = document.getElementById(
      "hljs-theme-light",
    ) as HTMLLinkElement | null;
    const isLight = theme === "light";

    if (darkCss) {
      darkCss.disabled = isLight;
    }
    if (lightCss) {
      lightCss.disabled = !isLight;
    }
  }, [theme, mode, messagesCount]);

  // 输入框自适应：先重置再按 scrollHeight 回填，避免删除内容后高度无法回缩。
  useEffect(() => {
    const inputEl = messageInputRef.current;
    if (!inputEl) {
      return;
    }

    inputEl.style.height = "auto";
    // 上限 160px，避免输入区过高压缩消息可视区域。
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  }, [input, messageInputRef]);

  // 切换历史会话后，等待内容渲染稳定再补一次滚动，避免 Markdown 异步渲染后底部偏移。
  useEffect(() => {
    if (mode !== "chat" || !activeConversationId) {
      return;
    }

    const panel = document.querySelector(".chat-panel");
    if (!panel) {
      scrollToBottom("auto");
      return;
    }

    let settleTimerId: number | null = null;
    const scrollAfterRender = () => {
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }
      settleTimerId = window.setTimeout(() => {
        scrollToBottom("auto");
      }, 40);
    };

    scrollAfterRender();

    const observer = new MutationObserver(() => {
      scrollAfterRender();
    });

    observer.observe(panel, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const stopObserveTimerId = window.setTimeout(() => {
      observer.disconnect();
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }
    }, 800);

    return () => {
      observer.disconnect();
      window.clearTimeout(stopObserveTimerId);
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }
    };
  }, [mode, activeConversationId]);

  // 消息或上传预览变化后自动滚动到底，保证最新内容可见。
  useEffect(() => {
    if (isStreaming) {
      scrollToBottom("auto");
      return;
    }
    scrollToBottom();
  }, [messages, uploadingImages, uploadingFiles, isStreaming]);

  // 组件卸载时兜底清理对象 URL，防止上传预览造成内存泄漏。
  useEffect(() => {
    return () => {
      const { conversations } = useChatStore.getState();
      Object.values(conversations).forEach((conversation) => {
        conversation.uploadingImages.forEach((item) =>
          URL.revokeObjectURL(item.url),
        );
      });
    };
  }, []);
}

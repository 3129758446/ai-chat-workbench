import { useEffect } from "react";
import type { RefObject } from "react";
import type { ThemeMode, UiMessage, UploadingImage } from "../types/chat";
import { useChatStore } from "../store/chatStore";
import { scrollToBottom } from "../utils/helpers";

interface UseAppEffectsParams {
  theme: ThemeMode;
  mode: "home" | "chat";
  messagesCount: number;
  input: string;
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
  messages: UiMessage[];
  uploadingImages: UploadingImage[];
}

export function useAppEffects({
  theme,
  mode,
  messagesCount,
  input,
  messageInputRef,
  messages,
  uploadingImages,
}: UseAppEffectsParams) {
  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.classList.toggle(
      "chat-active",
      mode === "chat" && messagesCount > 0,
    );
    document.body.classList.toggle("chat-layout", mode === "chat");

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

  useEffect(() => {
    const inputEl = messageInputRef.current;
    if (!inputEl) {
      return;
    }

    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  }, [input, messageInputRef]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, uploadingImages]);

  useEffect(() => {
    return () => {
      const { conversations } = useChatStore.getState();
      Object.values(conversations).forEach((conversation) => {
        conversation.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
      });
    };
  }, []);
}

/**
 * 文件功能：应用主容器，编排聊天业务流程与页面组件。
 * 设计思路：
 * 1. App 作为“流程协调层”，负责把 store、服务层和组件层串联起来。
 * 2. UI 组件保持尽量无状态，复杂流程（发送、停止、错误处理）收敛在这里。
 * 3. 通过 effect 统一处理主题同步、输入框高度、滚动行为，减少散点副作用。
 * 4. 请求发送采用“先写 UI 再流式更新”策略，保证用户操作即时反馈。
 */

import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { API_KEY_STORAGE } from "./constants";
import { Composer } from "./components/Composer";
import { ChatPanel } from "./components/ChatPanel";
import { WelcomeSection } from "./components/WelcomeSection";
import { streamChatCompletion } from "./services/api";
import { useChatStore } from "./store/chatStore";
import type { ApiMessage, MessagePart, UploadingImage } from "./types/chat";
import {
  ensureApiKey,
  escapeHtml,
  normalizeApiKey,
  scrollToBottom,
  uid,
} from "./utils/helpers";

function fileToDataUrl(file: File): Promise<string> {
  // 将上传文件转为 data URL，便于直接以内联方式提交到多模态接口。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(`读取图片失败：${file.name || "unknown"}`));
    reader.readAsDataURL(file);
  });
}

async function buildUserMessageContent(
  text: string,
  images: UploadingImage[],
): Promise<string | MessagePart[]> {
  // 无图片时直接走文本消息，保持请求体最小化。
  if (!images.length) {
    return text;
  }

  const parts: MessagePart[] = [];
  if (text) {
    parts.push({ type: "text", text });
  }

  for (const item of images) {
    // 顺序读取图片，保证内容顺序与用户上传顺序一致。
    const dataUrl = await fileToDataUrl(item.file);
    parts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  if (!parts.length) {
    parts.push({ type: "text", text: "请描述这张图片。" });
  }

  return parts;
}

function App() {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    input,
    theme,
    isStreaming,
    abortController,
    messages,
    uploadingImages,
    setInput,
    toggleTheme,
    setStreaming,
    setAbortController,
    addUiMessage,
    updateUiMessageText,
    pushHistory,
    removeHistoryMessage,
    clearConversation,
    addUploadingImages,
    removeUploadingImage,
    clearUploadingImages,
  } = useChatStore();

  // 同步主题到 body，并在亮暗主题间切换代码高亮样式。
  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.classList.toggle("chat-active", messages.length > 0);

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
  }, [theme, messages.length]);

  // 输入框自动增高，最大高度受控，避免遮挡消息区。
  useEffect(() => {
    const inputEl = messageInputRef.current;
    if (!inputEl) {
      return;
    }
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  }, [input]);

  // 新消息或预览变化时自动滚到底部。
  useEffect(() => {
    scrollToBottom();
  }, [messages, uploadingImages]);

  // 卸载时释放尚未清理的对象 URL，避免内存泄漏。
  useEffect(() => {
    return () => {
      useChatStore
        .getState()
        .uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const stopStreaming = () => {
    // 主动中断当前请求，触发 fetch 的 AbortError 分支。
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const handleClearConversation = () => {
    stopStreaming();
    clearConversation();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    // 仅接收图片文件，并为预览生成对象 URL。
    const files = Array.from(event.target.files || []);
    const nextImages: UploadingImage[] = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: uid("img"),
        file,
        url: URL.createObjectURL(file),
      }));

    if (nextImages.length) {
      addUploadingImages(nextImages);
    }
    event.target.value = "";
  };

  const promptForApiKey = (): string => {
    // 当本地缺少 Key 时即时弹窗录入，降低首次使用门槛。
    const inputValue = window.prompt(
      "未检测到本地 API Key，请输入你的 LINGXI_API_KEY：",
    );
    const nextKey = normalizeApiKey(inputValue);
    if (!nextKey) {
      return "";
    }
    localStorage.setItem(API_KEY_STORAGE, nextKey);
    return nextKey;
  };

  const sendMessage = async (cardPrompt?: string) => {
    // 流式阶段禁止并发发送，避免上下文错乱。
    if (isStreaming) {
      return;
    }

    const rawText = typeof cardPrompt === "string" ? cardPrompt : input;
    const text = rawText.trim();
    const hasImages = uploadingImages.length > 0;
    if (!text && !hasImages) {
      return;
    }

    let apiKey = ensureApiKey();
    if (!apiKey) {
      // 首次或 Key 被清空时，引导用户输入并立即持久化。
      apiKey = promptForApiKey();
      if (!apiKey) {
        addUiMessage({
          id: uid("assistant"),
          role: "assistant",
          text: "未输入 API Key，本次消息未发送。",
        });
        return;
      }
    }

    const images = [...uploadingImages];
    const userDisplayText = text || `（发送了 ${images.length} 张图片）`;

    let userContent: string | MessagePart[];
    try {
      // 在真正发送前完成图片编码，失败则给出即时错误提示。
      userContent = await buildUserMessageContent(text, images);
    } catch (error) {
      addUiMessage({
        id: uid("assistant"),
        role: "assistant",
        text: error instanceof Error ? error.message : "图片处理失败，请重试",
      });
      return;
    }

    addUiMessage({
      id: uid("user"),
      role: "user",
      text: userDisplayText,
      content: Array.isArray(userContent)
        ? userContent.filter(
            (item): item is MessagePart => item.type === "image_url",
          )
        : undefined,
    });

    const currentUserMessage: ApiMessage = {
      role: "user",
      content: userContent,
    };
    // 历史消息用于模型上下文，UI 消息用于显示，两者并行维护。
    pushHistory(currentUserMessage);

    setInput("");
    clearUploadingImages();

    const assistantId = uid("assistant");
    // 先插入空的助手消息占位，后续通过 onDelta 实时覆盖。
    addUiMessage({ id: assistantId, role: "assistant", text: "" });

    const controller = new AbortController();
    setAbortController(controller);
    setStreaming(true);

    try {
      const currentHistory = useChatStore.getState().chatHistory;
      const finalText = await streamChatCompletion(
        apiKey,
        currentHistory,
        controller.signal,
        (delta) => updateUiMessageText(assistantId, delta),
      );
      pushHistory({
        role: "assistant",
        content: finalText || "（未返回内容）",
      });
    } catch (error) {
      // 错误分级：中断/鉴权/限流/网络等类型给出可操作提示。
      let message = "请求失败，请稍后重试。";
      let shouldReplace = true;

      if (error instanceof Error && error.name === "AbortError") {
        removeHistoryMessage(currentUserMessage);
        const currentText = useChatStore
          .getState()
          .messages.find((item) => item.id === assistantId)?.text;
        if (currentText?.trim()) {
          shouldReplace = false;
        } else {
          message = "已停止生成。";
        }
      } else {
        const typedError = error as {
          status?: number;
          endpoint?: string;
          message?: string;
        };
        const endpointTip = typedError.endpoint
          ? `（端点：${escapeHtml(typedError.endpoint)}）`
          : "";

        if (typedError.status === 401 || typedError.status === 403) {
          localStorage.removeItem(API_KEY_STORAGE);
          message = `鉴权失败：API Key 无效、过期或无权限。已清除本地 Key，请重新写入 LINGXI_API_KEY 后再发送。${endpointTip}`;
        } else if (typedError.status === 429) {
          message = `请求频率或额度受限（429）。请稍后重试，或检查百炼账号额度。${endpointTip}`;
        } else if (typedError.status === 400 && hasImages) {
          message = `图片识别请求被拒绝（400）。请确认当前账号开通了视觉模型，并检查模型名是否可用（当前默认 qwen-vl-plus）。${endpointTip}`;
        } else if (typedError.message?.includes("Failed to fetch")) {
          message = `网络请求失败。若控制台出现 ERR_PROXY_CONNECTION_FAILED，可关闭代理或将 dashscope.aliyuncs.com、dashscope-intl.aliyuncs.com 设为直连后重试。${endpointTip}`;
        } else if (typedError.message) {
          message = `请求失败：${typedError.message}${endpointTip}`;
        }
      }

      if (shouldReplace) {
        updateUiMessageText(assistantId, message);
      }
    } finally {
      // 无论成功失败都恢复按钮状态。
      setAbortController(null);
      setStreaming(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift + Enter 换行。
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <>
      <div className="app-bg"></div>

      <main className="app">
        <WelcomeSection
          hidden={messages.length > 0}
          disabled={isStreaming}
          onPrompt={(prompt) => void sendMessage(prompt)}
        />
        <ChatPanel messages={messages} isStreaming={isStreaming} />
      </main>

      <Composer
        input={input}
        theme={theme}
        isStreaming={isStreaming}
        uploadingImages={uploadingImages}
        messageInputRef={messageInputRef}
        fileInputRef={fileInputRef}
        onInputChange={setInput}
        onSend={() => void sendMessage()}
        onKeyDown={handleKeyDown}
        onUploadClick={() => fileInputRef.current?.click()}
        onFileChange={handleFileChange}
        onRemoveImage={removeUploadingImage}
        onStop={stopStreaming}
        onToggleTheme={toggleTheme}
        onClearConversation={handleClearConversation}
      />
    </>
  );
}

export default App;

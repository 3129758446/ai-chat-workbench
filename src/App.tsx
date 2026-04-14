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
import { useLocation, useNavigate } from "react-router-dom";
import { Composer } from "./components/Composer";
import { ChatPanel } from "./components/ChatPanel";
import { WelcomeSection } from "./components/WelcomeSection";
import { useAppEffects } from "./hooks/useAppEffects";
import { useSendMessage } from "./hooks/useSendMessage";
import { useChatStore } from "./store/chatStore";
import type { UploadingImage } from "./types/chat";
import { uid } from "./utils/helpers";

type AppMode = "home" | "chat";

// 路由状态类型定义，包含首页跳转时的草稿提示和自动发送标志。
interface RouteState {
  draftPrompt?: string; // 首页跳转时，保存草稿提示。
  shouldAutoSend?: boolean; // 首页跳转时，是否自动发送（默认为 false，仅预填输入框）。
}

interface AppProps {
  mode?: AppMode; // 页面模式，决定显示欢迎页还是聊天页，默认为聊天页。
} 

function App({ mode = "chat" }: AppProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null); // 输入框 DOM 引用，用于动态调整高度和聚焦。
  const fileInputRef = useRef<HTMLInputElement | null>(null); // 隐藏的文件输入，用于触发系统文件选择对话框。
  const routePromptTokenRef = useRef(""); // 路由提示 token，避免因 location.state 变化导致重复发送同一提示。
  const navigate = useNavigate();
  const location = useLocation();

  const {
    input,
    theme,
    isStreaming,
    abortController, // 用于取消当前请求。
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

  useAppEffects({
    theme,
    mode,
    messagesCount: messages.length,
    input,
    messageInputRef,
    messages,
    uploadingImages,
  });

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

    if (mode === "chat") {
      navigate("/");
    }
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

  const sendMessage = useSendMessage({
    mode,
    input,
    isStreaming,
    uploadingImages,
    navigate,
    clearUploadingImages,
    setInput,
    addUiMessage,
    updateUiMessageText,
    pushHistory,
    removeHistoryMessage,
    setAbortController,
    setStreaming,
  });

  useEffect(() => {
    if (mode !== "chat" || isStreaming) {
      return;
    }

    const state = location.state as RouteState | null;
    const shouldAutoSend = Boolean(state?.shouldAutoSend);
    const draftPrompt = state?.draftPrompt?.trim() || "";
    // 从首页跳转时，无论是文本还是仅图片，都触发一次自动发送。
    if (!shouldAutoSend && !draftPrompt) {
      return;
    }

    const token = `${location.key}:${draftPrompt}:${shouldAutoSend ? 1 : 0}`;
    if (routePromptTokenRef.current === token) {
      return;
    }

    routePromptTokenRef.current = token;
    void sendMessage(draftPrompt);
    navigate(location.pathname, { replace: true, state: null });
  }, [
    mode,
    isStreaming,
    location.key,
    location.pathname,
    location.state,
    navigate,
    sendMessage,
  ]);

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
          hidden={mode === "chat" ? messages.length > 0 : false}
          disabled={isStreaming}
          onPrompt={(prompt) => void sendMessage(prompt)}
        />
        {mode === "chat" ? (
          <ChatPanel messages={messages} isStreaming={isStreaming} />
        ) : null}
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

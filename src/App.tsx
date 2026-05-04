/**
 * 文件功能：应用主容器，负责串联会话路由、聊天状态、消息发送和页面级交互。
 * 设计思路：
 * 1. App 作为“页面编排层”，不直接承载底层请求细节，而是协调 store、hook 和组件。
 * 2. 多会话场景下，路由参数 `conversationId` 是当前会话的单一事实来源。
 * 3. 首页和聊天页共用同一套发送链路，但首页只负责创建会话和跳转。
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

// 组件引入
import { ChatPanel } from "./components/ChatPanel";
import { Composer } from "./components/Composer";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { WelcomeSection } from "./components/WelcomeSection";

// Hooks 引入
import { useAppEffects } from "./hooks/useAppEffects";
import { useSendMessage } from "./hooks/useSendMessage";
import { useConversationManager } from "./hooks/useConversationManager";
import { useFileHandlers } from "./hooks/useFileHandlers";
import { useChatStore } from "./store";

// 类型与工具
import type { Conversation } from "./types/chat";

type AppMode = "home" | "chat";

interface AppProps {
  mode?: AppMode;
}

/**
 * 辅助函数：从完整会话对象中提取侧边栏展示所需的摘要信息
 * 目的：减少传递给 Sidebar 的数据量，优化渲染性能
 */
function getConversationSummaries(
  conversations: Record<string, Conversation>,
  orderedIds: string[],
) {
  return orderedIds
    .map((id) => conversations[id])
    .filter(Boolean)
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      lastMessagePreview: conversation.lastMessagePreview,
      isStreaming: conversation.isStreaming,
    }));
}

interface RouteState {
  draftPrompt?: string;
  shouldAutoSend?: boolean;
}

function App({ mode = "chat" }: AppProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const routePromptTokenRef = useRef("");
  const [homeInput, setHomeInput] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeConversationId = params.conversationId || null;

  const {
    theme,
    modelProvider,
    currentConversationId,
    orderedConversationIds,
    conversations,
    abortControllers,
    setTheme,
    setModelProvider,
    createConversation,
    ensureConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    setDraftInput,
    addUiMessage,
    updateUiMessageText,
    pushHistory,
    removeHistoryMessage,
    removeUploadingImage,
    clearUploadingImages,
    removeUploadingFile,
    clearUploadingFiles,
    setStreaming,
    setAbortController,
  } = useChatStore();

  const {
    handleCreateConversation: handleCreateConversationBase,
    handleSelectConversation,
    handleDeleteConversation: handleDeleteConversationBase,
  } = useConversationManager(routeConversationId);

  const { handleFileChange } = useFileHandlers(
    mode,
    routeConversationId,
    navigate,
    homeInput,
    setHomeInput,
  );

  const activeConversation =
    mode === "chat"
      ? (routeConversationId && conversations[routeConversationId]) ||
        (currentConversationId ? conversations[currentConversationId] : undefined)
      : undefined;

  const input = mode === "chat" ? activeConversation?.draftInput || "" : homeInput;
  const messages = activeConversation?.messages || [];
  const uploadingImages = activeConversation?.uploadingImages || [];
  const uploadingFiles = activeConversation?.uploadingFiles || [];
  const isStreaming = activeConversation?.isStreaming || false;
  const abortController = routeConversationId ? abortControllers[routeConversationId] || null : null;

  const sendMessage = useSendMessage({
    mode,
    conversationId: routeConversationId,
    input,
    modelProvider,
    isStreaming,
    uploadingImages,
    uploadingFiles,
    navigate,
    clearUploadingImages,
    clearUploadingFiles,
    setInput: setDraftInput,
    addUiMessage,
    updateUiMessageText,
    pushHistory,
    removeHistoryMessage,
    setAbortController,
    setStreaming,
    ensureConversation,
    createConversation: () => createConversation(),
  });

  const stopStreaming = () => {
    if (!routeConversationId || !abortController) return;
    abortController.abort();
    setAbortController(routeConversationId, null);
  };

  const handleClearConversation = () => {
    if (!routeConversationId) {
      setHomeInput("");
      return;
    }
    stopStreaming();
    deleteConversation(routeConversationId);
    setHomeInput("");
    navigate("/", { replace: true });
  };

  const handleCreateConversation = () => {
    setHomeInput("");
    handleCreateConversationBase();
  };

  const handleDeleteConversation = (conversationId: string) => {
    handleDeleteConversationBase(conversationId, stopStreaming);
  };

  const handleInputChange = (value: string) => {
    if (mode === "chat" && routeConversationId) {
      setDraftInput(routeConversationId, value);
    } else {
      setHomeInput(value);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const conversationsForSidebar = getConversationSummaries(
    conversations,
    orderedConversationIds,
  );

  useEffect(() => {
    if (mode !== "chat" || !routeConversationId) return;
    ensureConversation(routeConversationId);
    switchConversation(routeConversationId);
  }, [mode, routeConversationId, ensureConversation, switchConversation]);

  useEffect(() => {
    // 消费首页跳转时透传的草稿和自动发送标记，并做一次性去重。
    if (mode !== "chat" || !routeConversationId || isStreaming) {
      return;
    }

    const state = location.state as RouteState | null;
    const shouldAutoSend = Boolean(state?.shouldAutoSend);
    const draftPrompt = state?.draftPrompt?.trim() || "";
    if (!shouldAutoSend && !draftPrompt) {
      return;
    }

    const token = `${location.key}:${routeConversationId}:${draftPrompt}:${shouldAutoSend ? 1 : 0}`;
    if (routePromptTokenRef.current === token) {
      return;
    }

    routePromptTokenRef.current = token;

    if (draftPrompt) {
      setDraftInput(routeConversationId, draftPrompt);
    }

    if (shouldAutoSend) {
      void sendMessage(draftPrompt);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [
    mode,
    routeConversationId,
    isStreaming,
    location.key,
    location.pathname,
    location.state,
    navigate,
    sendMessage,
    setDraftInput,
  ]);

  useAppEffects({
    theme,
    mode,
    messagesCount: messages.length,
    input,
    messageInputRef,
    messages,
    uploadingImages,
    uploadingFiles,
  });

  return (
    <>
      <div className="app-bg"></div>

      <div className="app-shell chat-shell">
        <ConversationSidebar
          conversations={conversationsForSidebar}
          currentConversationId={routeConversationId}
          onCreateConversation={handleCreateConversation}
          onSelectConversation={handleSelectConversation}
          onRenameConversation={renameConversation}
          onDeleteConversation={handleDeleteConversation}
        />

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
      </div>

      <Composer
        input={input}
        theme={theme}
        modelProvider={modelProvider}
        isStreaming={isStreaming}
        uploadingImages={uploadingImages}
        uploadingFiles={uploadingFiles}
        messageInputRef={messageInputRef}
        fileInputRef={fileInputRef}
        onInputChange={handleInputChange}
        onSend={() => void sendMessage()}
        onKeyDown={handleKeyDown}
        onUploadClick={() => fileInputRef.current?.click()}
        onFileChange={handleFileChange}
        onRemoveImage={(imageId) => {
          if (routeConversationId) {
            removeUploadingImage(routeConversationId, imageId);
          }
        }}
        onRemoveFile={(fileId) => {
          if (routeConversationId) {
            removeUploadingFile(routeConversationId, fileId);
          }
        }}
        onStop={stopStreaming}
        onThemeChange={setTheme}
        onModelProviderChange={setModelProvider}
        onClearConversation={handleClearConversation}
      />
    </>
  );
}

export default App;

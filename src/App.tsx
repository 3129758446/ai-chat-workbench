/**
 * 文件功能：应用主容器，负责串联会话路由、聊天状态、消息发送和页面级交互。
 * 设计思路：
 * 1. App 作为“页面编排层”，不直接承载底层请求细节，而是协调 store、hook 和组件。
 * 2. 多会话场景下，路由参数 `conversationId` 是当前会话的单一事实来源。
 * 3. 首页和聊天页共用同一套发送链路，但首页只负责创建会话和跳转。
 */

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChatPanel } from "./components/ChatPanel";
import { Composer } from "./components/Composer";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { WelcomeSection } from "./components/WelcomeSection";
import { useAppEffects } from "./hooks/useAppEffects";
import { useSendMessage } from "./hooks/useSendMessage";
import { useChatStore } from "./store/chatStore";
import type { Conversation, UploadingImage } from "./types/chat";
import { uid } from "./utils/helpers";

type AppMode = "home" | "chat";

interface RouteState {
  draftPrompt?: string;
  shouldAutoSend?: boolean;
}

interface AppProps {
  mode?: AppMode;
}

function getConversationSummaries(
  conversations: Record<string, Conversation>,
  orderedIds: string[],
) {
  // 侧栏只消费轻量摘要，避免把完整会话对象直接暴露给展示组件。
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
    currentConversationId,
    orderedConversationIds,
    conversations,
    abortControllers,
    setTheme,
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
    addUploadingImages,
    removeUploadingImage,
    clearUploadingImages,
    setStreaming,
    setAbortController,
  } = useChatStore();

  const activeConversation =
    (routeConversationId && conversations[routeConversationId]) ||
    (currentConversationId ? conversations[currentConversationId] : undefined);

  const input = mode === "chat" ? activeConversation?.draftInput || "" : homeInput;
  const messages = activeConversation?.messages || [];
  const uploadingImages = activeConversation?.uploadingImages || [];
  const isStreaming = activeConversation?.isStreaming || false;
  const abortController = routeConversationId
    ? abortControllers[routeConversationId] || null
    : null;

  useEffect(() => {
    // 聊天页刷新或直达时，确保路由上的会话在 store 中存在。
    if (mode !== "chat" || !routeConversationId) {
      return;
    }

    ensureConversation(routeConversationId);
    switchConversation(routeConversationId);
  }, [mode, routeConversationId, ensureConversation, switchConversation]);

  useAppEffects({
    theme,
    mode,
    messagesCount: messages.length,
    input,
    messageInputRef,
    messages,
    uploadingImages,
  });

  const sendMessage = useSendMessage({
    mode,
    conversationId: routeConversationId,
    input,
    isStreaming,
    uploadingImages,
    navigate,
    clearUploadingImages,
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
    // 通过当前会话对应的 AbortController 停止流式返回。
    if (!routeConversationId || !abortController) {
      return;
    }
    abortController.abort();
    setAbortController(routeConversationId, null);
  };

  const handleClearConversation = () => {
    // 首页清空仅重置草稿；聊天页则删除当前会话记录。
    if (!routeConversationId) {
      setHomeInput("");
      return;
    }

    stopStreaming();
    handleDeleteConversation(routeConversationId);
  };

  const handleCreateConversation = () => {
    const nextId = createConversation();
    navigate(`/chat/${nextId}`);
  };

  const handleSelectConversation = (conversationId: string) => {
    navigate(`/chat/${conversationId}`);
  };

  const handleDeleteConversation = (conversationId: string) => {
    const isCurrent = routeConversationId === conversationId;
    deleteConversation(conversationId);

    if (!isCurrent) {
      return;
    }

    const remainingIds = useChatStore.getState().orderedConversationIds;
    if (remainingIds.length) {
      navigate(`/chat/${remainingIds[0]}`, { replace: true });
      return;
    }

    const nextId = createConversation();
    navigate(`/chat/${nextId}`, { replace: true });
  };

  const handleInputChange = (value: string) => {
    if (mode === "chat" && routeConversationId) {
      setDraftInput(routeConversationId, value);
      return;
    }
    setHomeInput(value);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    // 图片上传在聊天页归属当前会话，在首页则先创建会话再挂载草稿图片。
    const files = Array.from(event.target.files || []);
    const nextImages: UploadingImage[] = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: uid("img"),
        file,
        url: URL.createObjectURL(file),
      }));

    if (!nextImages.length) {
      event.target.value = "";
      return;
    }

    if (mode === "chat" && routeConversationId) {
      addUploadingImages(routeConversationId, nextImages);
      event.target.value = "";
      return;
    }

    const nextId = createConversation();
    addUploadingImages(nextId, nextImages);
    navigate(`/chat/${nextId}`, {
      state: {
        draftPrompt: homeInput,
        shouldAutoSend: false,
      } satisfies RouteState,
    });
    setHomeInput("");
    event.target.value = "";
  };

  useEffect(() => {
    // 处理首页跳转带入的草稿和自动发送标记，且只消费一次。
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

  return (
    <>
      <div className="app-bg"></div>

      <div className={`app-shell ${mode === "chat" ? "chat-shell" : "home-shell"}`}>
        {mode === "chat" ? (
          <ConversationSidebar
            conversations={conversationsForSidebar}
            currentConversationId={routeConversationId}
            onCreateConversation={handleCreateConversation}
            onSelectConversation={handleSelectConversation}
            onRenameConversation={renameConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        ) : null}

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
        isStreaming={isStreaming}
        uploadingImages={uploadingImages}
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
        onStop={stopStreaming}
        onThemeChange={setTheme}
        onClearConversation={handleClearConversation}
      />
    </>
  );
}

export default App;

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
    if (!routeConversationId || !abortController) {
      return;
    }
    abortController.abort();
    setAbortController(routeConversationId, null);
  };

  const handleClearConversation = () => {
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

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
import { useRemoteChatPersistence } from "./hooks/useRemoteChatPersistence";

// 组件引入
import { ChatPanel } from "./components/ChatPanel";
import { Composer } from "./components/Composer";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { WelcomeSection } from "./components/WelcomeSection";

// Hooks 引入
import { useAppEffects } from "./hooks/useAppEffects"; // 应用级状态管理
import { useSendMessage } from "./hooks/useSendMessage"; // 消息发送管理
import { useConversationManager } from "./hooks/useConversationManager"; // 会话生命周期管理中心
import { useFileHandlers } from "./hooks/useFileHandlers"; // 文件上传管理
import { useChatStore } from "./store"; // 聊天状态管理

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
  conversations: Record<string, Conversation>, // 会话对象映射
  orderedIds: string[], // 会话 ID 有序列表
) {
  return orderedIds
    .map((id) => conversations[id]) // 从映射中提取会话对象
    .filter(Boolean) // 过滤掉 undefined 值
    .map((conversation) => ({
      // 提取会话摘要信息
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

// App 组件：应用主容器，负责协调会话路由、聊天状态、消息发送和页面级交互
function App({ mode = "chat" }: AppProps) {
  useRemoteChatPersistence();

  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const routePromptTokenRef = useRef("");
  const [homeInput, setHomeInput] = useState(""); // 首页输入框状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navigate = useNavigate(); // 路由跳转函数
  const location = useLocation(); // 当前路由信息
  const params = useParams(); // 当前路由参数
  const routeConversationId = params.conversationId || null; // 当前路由会话 ID

  const {
    theme, // 当前主题
    modelProvider, // 当前模型提供者
    currentConversationId, // 当前会话 ID
    orderedConversationIds, // 会话 ID 有序列表
    conversations, // 会话对象映射
    // abortControllers, // 会话取消控制器映射
    setTheme, // 当前主题状态
    setModelProvider, // 当前模型提供者状态
    createConversation, // 创建会话函数
    ensureConversation, // 确保会话存在函数
    switchConversation, // 切换会话函数
    renameConversation, // 重命名会话函数
    deleteConversation, // 删除会话函数
    setDraftInput, // 设置草稿输入函数
    addUiMessage, // 添加 UI 消息函数
    updateUiMessageText, // 更新 UI 消息文本函数
    pushHistory, // 推送历史消息函数
    removeHistoryMessage, // 删除历史消息函数
    removeUploadingImage, // 删除上传中的图片函数
    clearUploadingImages, // 清除上传中的图片函数
    removeUploadingFile, // 删除上传中的文件函数
    clearUploadingFiles, // 清除上传中的文件函数
    setStreaming, // 设置流式响应状态
    setAbortController, // 设置取消控制器函数函数
  } = useChatStore(); // 聊天状态管理

  // 会话生命周期管理中心
  // 提供创建、选择、删除会话的函数
  const {
    handleCreateConversation: handleCreateConversationBase,
    handleSelectConversation,
    handleDeleteConversation: handleDeleteConversationBase,
  } = useConversationManager(routeConversationId);

  // 文件上传管理
  // 提供文件上传、删除、预览等功能
  const { handleFileChange } = useFileHandlers(
    mode,
    routeConversationId,
    navigate,
    homeInput,
    setHomeInput,
  );

  // 消息发送管理
  // 提供消息发送、历史消息管理等功能
  const activeConversation =
    mode === "chat"
      ? (routeConversationId && conversations[routeConversationId]) ||
        (currentConversationId
          ? conversations[currentConversationId]
          : undefined)
      : undefined; // 当前会话对象

  const input =
    mode === "chat" ? activeConversation?.draftInput || "" : homeInput; // 当前输入框文本
  const messages = activeConversation?.messages || []; // 当前会话的消息列表
  const uploadingImages = activeConversation?.uploadingImages || []; // 上传中的图片列表
  const uploadingFiles = activeConversation?.uploadingFiles || []; // 上传中的文件列表
  const isStreaming = activeConversation?.isStreaming || false; // 是否正在流式响应

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

  // 停止流式响应
  const stopStreaming = () => {
    if (!routeConversationId) return;
    const latestAbortController =
      useChatStore.getState().abortControllers[routeConversationId] || null;
    latestAbortController?.abort(); // 点击时读取最新控制器，避免闭包拿到旧值。
    setAbortController(routeConversationId, null);
    setStreaming(routeConversationId, false);
  };

  // 清空会话
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

  // 创建会话
  const handleCreateConversation = () => {
    setHomeInput("");
    setIsSidebarOpen(false);
    handleCreateConversationBase();
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  // 删除会话
  const handleDeleteConversation = (conversationId: string) => {
    handleDeleteConversationBase(conversationId, stopStreaming);
  };

  // 输入框变化处理
  // 处理用户输入的文本，根据模式和会话状态更新草稿输入或首页输入框
  const handleInputChange = (value: string) => {
    if (mode === "chat" && routeConversationId) {
      setDraftInput(routeConversationId, value);
    } else {
      setHomeInput(value);
    }
  };

  // 键盘事件处理
  // 处理用户在输入框中按下的键盘事件
  // 处理 Enter 键按下事件，发送消息
  // 处理 Shift+Enter 键按下事件，不发送消息
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  // 发送消息
  const conversationsForSidebar = getConversationSummaries(
    conversations,
    orderedConversationIds, // 会话 ID 有序列表
  );

  const mobileConversationTitle =
    activeConversation?.title ||
    activeConversation?.lastMessagePreview ||
    "AI 对话助手";

  const handleSidebarSelectConversation = (conversationId: string) => {
    handleSelectConversation(conversationId);
    setIsSidebarOpen(false);
  };

  // 确保当前会话存在并切换到该会话
  useEffect(() => {
    if (mode !== "chat" || !routeConversationId) return;
    ensureConversation(routeConversationId); // 确保会话存在
    switchConversation(routeConversationId); // 切换到该会话
  }, [mode, routeConversationId, ensureConversation, switchConversation]); // 依赖模式、路由会话 ID、确保会话函数、切换会话函数

  useEffect(() => {
    // 消费首页跳转时透传的草稿和自动发送标记，并做一次性去重。
    if (mode !== "chat" || !routeConversationId || isStreaming) {
      return;
    }
    const state = location.state as RouteState | null; // 获取路由状态
    const shouldAutoSend = Boolean(state?.shouldAutoSend); // 是否自动发送消息
    const draftPrompt = state?.draftPrompt?.trim() || ""; // 草稿消息
    if (!shouldAutoSend && !draftPrompt) {
      // 如果不自动发送消息且没有草稿消息
      return;
    }

    // 去重处理
    // location.key 是路由路径，用于区分不同的路由参数
    const token = `${location.key}:${routeConversationId}:${draftPrompt}:${shouldAutoSend ? 1 : 0}`;
    if (routePromptTokenRef.current === token) {
      // 如果当前参数与上一次相同，则不处理
      return;
    }
    // 更新路由参数令牌
    routePromptTokenRef.current = token;
    // 更新草稿输入
    if (draftPrompt) {
      setDraftInput(routeConversationId, draftPrompt);
    }
    // 自动发送消息
    if (shouldAutoSend) {
      void sendMessage(draftPrompt);
    }
    // 清空透传参数
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

  // 应用效果处理
  // 处理应用的全局效果，如主题、模式、消息数量、输入框引用、消息列表、上传中的图片和文件
  useAppEffects({
    theme,
    mode,
    activeConversationId: routeConversationId,
    messagesCount: messages.length,
    isStreaming,
    input,
    messageInputRef,
    messages,
    uploadingImages,
    uploadingFiles,
  });

  return (
    <>
      <div className="app-bg"></div>
      <header className="mobile-chat-bar">
        <button
          type="button"
          className="mobile-chat-bar-btn"
          aria-label="打开会话列表"
          onClick={() => setIsSidebarOpen(true)}
        >
          会话
        </button>
        <span className="mobile-chat-title" title={mobileConversationTitle}>
          {mobileConversationTitle}
        </span>
        <button
          type="button"
          className="mobile-chat-bar-btn mobile-theme-btn"
          aria-label="切换主题"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12.8A8.2 8.2 0 0 1 11.2 3a7.2 7.2 0 1 0 9.8 9.8z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4.5a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v1.5a1 1 0 0 0 1 1zm0 15a1 1 0 0 0-1 1V22a1 1 0 1 0 2 0v-1.5a1 1 0 0 0-1-1zm7.5-6.5H22a1 1 0 1 0 0-2h-2.5a1 1 0 1 0 0 2zM2 13h2.5a1 1 0 1 0 0-2H2a1 1 0 1 0 0 2zm15.7-5.3 1.1-1.1a1 1 0 0 0-1.4-1.4l-1.1 1.1a1 1 0 1 0 1.4 1.4zM6.3 16.3l-1.1 1.1a1 1 0 1 0 1.4 1.4l1.1-1.1a1 1 0 1 0-1.4-1.4zm11.4 0a1 1 0 0 0-1.4 1.4l1.1 1.1a1 1 0 0 0 1.4-1.4l-1.1-1.1zM6.6 5.2a1 1 0 0 0-1.4 1.4l1.1 1.1a1 1 0 1 0 1.4-1.4L6.6 5.2zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="mobile-chat-bar-btn"
          aria-label="新建会话"
          onClick={handleCreateConversation}
        >
          新建
        </button>
      </header>
      <button
        type="button"
        className={`sidebar-backdrop ${isSidebarOpen ? "open" : ""}`}
        aria-label="关闭会话列表"
        onClick={() => setIsSidebarOpen(false)}
      />
      {/* 会话侧边栏 */}
      <div className="app-shell chat-shell">
        <div className={`sidebar-drawer ${isSidebarOpen ? "open" : ""}`}>
          <ConversationSidebar
            conversations={conversationsForSidebar} // 会话摘要列表
            currentConversationId={routeConversationId} // 当前会话 ID
            onCreateConversation={handleCreateConversation} // 创建会话
            onSelectConversation={handleSidebarSelectConversation} // 选择会话
            onRenameConversation={renameConversation} // 重命名会话
            onDeleteConversation={handleDeleteConversation} // 删除会话
          />
        </div>
        {/* 聊天内容区域 */}
        <main className="app">
          <WelcomeSection
            // 欢迎区域
            hidden={mode === "chat" ? messages.length > 0 : false}
            disabled={isStreaming}
            onPrompt={(prompt) => void sendMessage(prompt)}
          />
          {mode === "chat" ? (
            // 聊天内容区域
            // 显示当前会话的消息
            // 处理流式响应
            <ChatPanel messages={messages} isStreaming={isStreaming} />
          ) : null}
        </main>
      </div>
      {/* 输入框区域 */}
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

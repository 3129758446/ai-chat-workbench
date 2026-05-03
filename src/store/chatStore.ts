import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CHAT_STORE_STORAGE, THEME_STORAGE } from "../constants";
import type {
  ApiMessage,
  Conversation,
  ConversationDraft,
  ThemeMode,
  UiMessage,
  UploadingImage,
} from "../types/chat";
import { uid } from "../utils/helpers";

interface PersistedChatState {
  theme: ThemeMode;
  currentConversationId: string | null;
  orderedConversationIds: string[];
  conversations: Record<string, ConversationDraft>;
}

interface ChatState {
  theme: ThemeMode;
  currentConversationId: string | null;
  orderedConversationIds: string[];
  conversations: Record<string, Conversation>;
  abortControllers: Record<string, AbortController | null>;

  setTheme: (theme: ThemeMode) => void;

  createConversation: (options?: { title?: string }) => string;
  ensureConversation: (id: string) => void;
  switchConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  clearConversation: (id: string) => void;

  setDraftInput: (id: string, value: string) => void;
  addUiMessage: (id: string, message: UiMessage) => void;
  updateUiMessageText: (id: string, messageId: string, text: string) => void;
  pushHistory: (id: string, message: ApiMessage) => void;
  removeHistoryMessage: (id: string, target: ApiMessage) => void;

  addUploadingImages: (id: string, images: UploadingImage[]) => void;
  removeUploadingImage: (id: string, imageId: string) => void;
  clearUploadingImages: (id: string) => void;

  setStreaming: (id: string, value: boolean) => void;
  setAbortController: (id: string, controller: AbortController | null) => void;
}

function normalizeTheme(theme: string | null | undefined): ThemeMode {
  return theme === "light" ? "light" : "dark";
}

const DEFAULT_THEME = normalizeTheme(localStorage.getItem(THEME_STORAGE));

function previewFromContent(content: ApiMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .join(" ")
    .trim();

  if (text) {
    return text;
  }

  const imageCount = content.filter((part) => part.type === "image_url").length;
  return imageCount ? `[图片] ${imageCount} 张` : "";
}

function shorten(text: string, max = 48): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function createConversationRecord(
  id = uid("conversation"),
  title = "新会话",
): Conversation {
  const now = Date.now();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: "",
    draftInput: "",
    messages: [],
    chatHistory: [],
    uploadingImages: [],
    isStreaming: false,
  };
}

function deriveConversationPatch(
  conversation: Conversation,
): Partial<Conversation> {
  const firstUserMessage = conversation.chatHistory.find(
    (message) => message.role === "user",
  );
  const suggestedTitle = shorten(
    firstUserMessage ? previewFromContent(firstUserMessage.content) : "",
    24,
  );

  const lastHistory = conversation.chatHistory[conversation.chatHistory.length - 1];
  const lastMessagePreview = lastHistory
    ? shorten(previewFromContent(lastHistory.content))
    : "";

  return {
    title: suggestedTitle || conversation.title || "新会话",
    lastMessagePreview,
    updatedAt: Date.now(),
  };
}

function normalizePersistedConversation(
  draft: ConversationDraft | undefined,
  fallbackId: string,
): Conversation {
  const base = createConversationRecord(fallbackId);
  if (!draft) {
    return base;
  }

  return {
    ...base,
    ...draft,
    uploadingImages: [],
    isStreaming: false,
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      currentConversationId: null,
      orderedConversationIds: [],
      conversations: {},
      abortControllers: {},

      setTheme: (theme) => {
        localStorage.setItem(THEME_STORAGE, theme);
        set({ theme });
      },

      createConversation: (options) => {
        const conversation = createConversationRecord(undefined, options?.title);
        set((state) => ({
          currentConversationId: conversation.id,
          orderedConversationIds: [conversation.id, ...state.orderedConversationIds],
          conversations: {
            ...state.conversations,
            [conversation.id]: conversation,
          },
          abortControllers: {
            ...state.abortControllers,
            [conversation.id]: null,
          },
        }));
        return conversation.id;
      },

      ensureConversation: (id) => {
        const existing = get().conversations[id];
        if (existing) {
          if (get().currentConversationId !== id) {
            set({ currentConversationId: id });
          }
          return;
        }

        const conversation = createConversationRecord(id);
        set((state) => ({
          currentConversationId: id,
          orderedConversationIds: state.orderedConversationIds.includes(id)
            ? state.orderedConversationIds
            : [id, ...state.orderedConversationIds],
          conversations: {
            ...state.conversations,
            [id]: conversation,
          },
          abortControllers: {
            ...state.abortControllers,
            [id]: null,
          },
        }));
      },

      switchConversation: (id) => {
        if (!get().conversations[id]) {
          get().ensureConversation(id);
          return;
        }
        set({ currentConversationId: id });
      },

      renameConversation: (id, title) =>
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
                title: title.trim() || conversation.title,
                updatedAt: Date.now(),
              },
            },
          };
        }),

      deleteConversation: (id) =>
        set((state) => {
          const nextConversations = { ...state.conversations };
          const target = nextConversations[id];
          if (!target) {
            return state;
          }

          target.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));
          delete nextConversations[id];

          const nextAbortControllers = { ...state.abortControllers };
          nextAbortControllers[id]?.abort();
          delete nextAbortControllers[id];

          const nextOrderedIds = state.orderedConversationIds.filter(
            (conversationId) => conversationId !== id,
          );
          const nextCurrentId =
            state.currentConversationId === id
              ? nextOrderedIds[0] || null
              : state.currentConversationId;

          return {
            currentConversationId: nextCurrentId,
            orderedConversationIds: nextOrderedIds,
            conversations: nextConversations,
            abortControllers: nextAbortControllers,
          };
        }),

      clearConversation: (id) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) {
            return state;
          }

          conversation.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));

          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...createConversationRecord(id, conversation.title),
                createdAt: conversation.createdAt,
              },
            },
            abortControllers: {
              ...state.abortControllers,
              [id]: null,
            },
          };
        }),

      setDraftInput: (id, value) =>
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
                draftInput: value,
              },
            },
          };
        }),

      addUiMessage: (id, message) =>
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
                messages: [...conversation.messages, message],
                updatedAt: Date.now(),
              },
            },
          };
        }),

      updateUiMessageText: (id, messageId, text) =>
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
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? { ...message, text } : message,
                ),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      pushHistory: (id, message) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) {
            return state;
          }

          const nextConversation: Conversation = {
            ...conversation,
            chatHistory: [...conversation.chatHistory, message],
          };

          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...nextConversation,
                ...deriveConversationPatch(nextConversation),
              },
            },
            orderedConversationIds: [
              id,
              ...state.orderedConversationIds.filter(
                (conversationId) => conversationId !== id,
              ),
            ],
          };
        }),

      removeHistoryMessage: (id, target) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) {
            return state;
          }

          const index = conversation.chatHistory.lastIndexOf(target);
          if (index < 0) {
            return state;
          }

          const nextHistory = [...conversation.chatHistory];
          nextHistory.splice(index, 1);
          const nextConversation: Conversation = {
            ...conversation,
            chatHistory: nextHistory,
          };

          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...nextConversation,
                ...deriveConversationPatch(nextConversation),
              },
            },
          };
        }),

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

      removeUploadingImage: (id, imageId) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) {
            return state;
          }

          const target = conversation.uploadingImages.find((item) => item.id === imageId);
          if (target) {
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

      clearUploadingImages: (id) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) {
            return state;
          }

          conversation.uploadingImages.forEach((item) => URL.revokeObjectURL(item.url));

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

      setStreaming: (id, value) =>
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
                isStreaming: value,
              },
            },
          };
        }),

      setAbortController: (id, controller) =>
        set((state) => ({
          abortControllers: {
            ...state.abortControllers,
            [id]: controller,
          },
        })),
    }),
    {
      name: CHAT_STORE_STORAGE,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedChatState => ({
        theme: state.theme,
        currentConversationId: state.currentConversationId,
        orderedConversationIds: state.orderedConversationIds,
        conversations: Object.fromEntries(
          Object.entries(state.conversations).map(([id, conversation]) => [
            id,
            {
              id: conversation.id,
              title: conversation.title,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              lastMessagePreview: conversation.lastMessagePreview,
              draftInput: conversation.draftInput,
              messages: conversation.messages,
              chatHistory: conversation.chatHistory,
            },
          ]),
        ),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as PersistedChatState | undefined;
        if (!persistedState) {
          return current;
        }

        const conversations = Object.fromEntries(
          Object.entries(persistedState.conversations || {}).map(([id, draft]) => [
            id,
            normalizePersistedConversation(draft, id),
          ]),
        );

        const abortControllers = Object.fromEntries(
          Object.keys(conversations).map((id) => [id, null]),
        );

        return {
          ...current,
          ...persistedState,
          theme: normalizeTheme(persistedState.theme),
          conversations,
          abortControllers,
        };
      },
    },
  ),
);

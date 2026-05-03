import { useState } from "react";

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: number;
  lastMessagePreview: string;
  isStreaming: boolean;
}

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  currentConversationId: string | null;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  return (
    <aside className="conversation-sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">会话</h2>
        <button
          type="button"
          className="sidebar-create-btn"
          onClick={onCreateConversation}
        >
          新建
        </button>
      </div>

      <div className="conversation-list">
        {conversations.map((conversation) => {
          const isActive = conversation.id === currentConversationId;
          const question =
            conversation.title ||
            conversation.lastMessagePreview ||
            "开始一个新问题";
          const isEditing = editingId === conversation.id;

          return (
            <article
              key={conversation.id}
              className={`conversation-card ${isActive ? "active" : ""}`}
            >
              <div className="conversation-main">
                {isEditing ? (
                  <input aria-label="重命名会话"
                    className="conversation-rename-input"
                    value={draftTitle}
                    autoFocus
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={() => {
                      onRenameConversation(conversation.id, draftTitle);
                      setEditingId(null);
                      setDraftTitle("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onRenameConversation(conversation.id, draftTitle);
                        setEditingId(null);
                        setDraftTitle("");
                      }
                      if (event.key === "Escape") {
                        setEditingId(null);
                        setDraftTitle("");
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="conversation-select-btn"
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <p className="conversation-question">
                      {conversation.isStreaming ? "正在生成回复..." : question}
                    </p>
                  </button>
                )}
              </div>

              <div className="conversation-actions">
                <button
                  type="button"
                  className="conversation-icon-btn"
                  title="重命名会话"
                  onClick={() => {
                    setEditingId(conversation.id);
                    setDraftTitle(conversation.title || conversation.lastMessagePreview);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="conversation-icon-btn conversation-delete-btn"
                  title="删除会话"
                  onClick={() => onDeleteConversation(conversation.id)}
                >
                  ×
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

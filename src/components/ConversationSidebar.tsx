/**
 * 文件功能：会话侧栏组件，展示多会话列表并承载新建、切换、重命名、删除操作。
 * 设计思路：
 * 1. 侧栏仅消费会话摘要，不直接操作完整消息历史，降低展示层与状态层耦合。
 * 2. 重命名在组件内部维护临时草稿，提交时再通过回调交给上层落库。
 * 3. 会话列表按“当前会话 + 操作按钮”组织，保证信息密度和可操作性平衡。
 */

import { useState } from "react";

// 会话摘要
interface ConversationItem {
  id: string; // 会话ID
  title: string; // 会话标题
  updatedAt: number; // 时间戳，单位毫秒
  lastMessagePreview: string; // 最近消息预览文本
  isStreaming: boolean; // 是否处于流式响应状态
}

// 侧栏组件属性
interface ConversationSidebarProps {
  conversations: ConversationItem[]; // 会话列表
  currentConversationId: string | null; // 当前选中会话ID
  onCreateConversation: () => void; // 新建会话回调
  onSelectConversation: (conversationId: string) => void; // 选择会话回调
  onRenameConversation: (conversationId: string, title: string) => void; // 重命名会话回调
  onDeleteConversation: (conversationId: string) => void; // 删除会话回调
}
// 会话侧栏组件，展示会话列表并提供操作入口
export function ConversationSidebar({
  conversations, // 会话列表
  currentConversationId, // 当前选中会话ID
  onCreateConversation, // 新建会话回调
  onSelectConversation, // 选择会话回调
  onRenameConversation,  // 重命名会话回调
  onDeleteConversation,  // 删除会话回调
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

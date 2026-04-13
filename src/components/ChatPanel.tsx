/**
 * 文件功能：聊天消息展示组件，负责用户/助手消息的渲染分流。
 * 设计思路：
 * 1. 将消息展示拆成 ChatPanel、AssistantMessage、UserMessage 三层，降低单组件复杂度。
 * 2. 助手消息使用 markdown 渲染能力，用户消息保持结构化直出，降低 XSS 风险面。
 * 3. 打字状态仅作用于最后一条助手消息，避免历史消息被误判为流式中。
 */

import { useEffect, useMemo, useRef } from "react";
import type { UiMessage } from "../types/chat";
import { enhanceCodeBlocks, renderMarkdownToHtml } from "../utils/markdown";

interface ChatPanelProps {
  messages: UiMessage[];
  isStreaming: boolean;
}

function AssistantMessage({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Markdown 渲染结果缓存，避免无关更新重复计算。
  const html = useMemo(() => renderMarkdownToHtml(text), [text]);

  useEffect(() => {
    // 每次 HTML 变化后为新代码块补高亮和复制按钮。
    if (containerRef.current) {
      enhanceCodeBlocks(containerRef.current);
    }
  }, [html]);

  // 仅在流式且当前文本为空时展示打字占位。
  const showTyping = isStreaming && !text.trim();

  return (
    <div className="bubble ai">
      {showTyping ? (
        <div className="markdown-body">
          <span className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function UserMessage({ message }: { message: UiMessage }) {
  // 用户消息仅渲染图片片段，文本使用 message.text 统一展示。
  const imageParts = (message.content || []).filter(
    (part) => part.type === "image_url",
  );

  return (
    <div className="bubble user">
      {message.text ? <p className="sent-text">{message.text}</p> : null}
      {imageParts.length ? (
        <div className="sent-image-list">
          {imageParts.map((part, index) => (
            <img
              key={`${part.image_url.url}-${index}`}
              className="sent-image"
              src={part.image_url.url}
              alt={`用户发送图片 ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({ messages, isStreaming }: ChatPanelProps) {
  return (
    <section className="chat-panel" aria-live="polite">
      {messages.map((message, index) => {
        // 只有最后一条助手消息在流式阶段需要显示特殊状态。
        const assistantStreaming =
          message.role === "assistant" &&
          isStreaming &&
          index === messages.length - 1;

        return (
          <div
            key={message.id}
            className={`message-row ${message.role === "user" ? "user" : "assistant"}`}
          >
            {message.role === "assistant" ? (
              <span className="avatar">灵</span>
            ) : null}
            {message.role === "assistant" ? (
              <AssistantMessage
                text={message.text}
                isStreaming={assistantStreaming}
              />
            ) : (
              <UserMessage message={message} />
            )}
          </div>
        );
      })}
    </section>
  );
}

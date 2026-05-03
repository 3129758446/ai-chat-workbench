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
  const html = useMemo(() => renderMarkdownToHtml(text), [text]);

  useEffect(() => {
    if (containerRef.current) {
      enhanceCodeBlocks(containerRef.current);
    }
  }, [html]);

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
              <span className="avatar">AI</span>
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

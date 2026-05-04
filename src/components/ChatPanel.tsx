/**
 * 文件功能：聊天消息展示组件，负责用户/助手消息的渲染分流。
 * 设计思路：
 * 1. 将消息展示拆成 ChatPanel、AssistantMessage、UserMessage 三层，降低单组件复杂度。
 * 2. 助手消息使用 markdown 渲染能力，用户消息保持结构化直出，降低 XSS 风险面。
 * 3. 打字状态仅作用于最后一条助手消息，避免历史消息被误判为流式中。
 */

import {
  memo,
  useDeferredValue,
  useLayoutEffect,
  useState,
  useEffect,
  useRef,
} from "react";
import type { UiMessage } from "../types/chat";
// markdown 渲染和代码块增强工具函数。
import { enhanceCodeBlocks, renderMarkdownToHtml } from "../utils/markdown";

interface ChatPanelProps {
  messages: UiMessage[];
  isStreaming: boolean;
}

const AssistantMessage = memo(function AssistantMessage({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deferredStreamingText = useDeferredValue(text);
  
  // 异步渲染状态
  const [html, setHtml] = useState("");
  const [streamingHtml, setStreamingHtml] = useState("");

  // 处理全量渲染 (非流式态)
  useEffect(() => {
    if (isStreaming) return;
    renderMarkdownToHtml(text).then(setHtml);
  }, [text, isStreaming]);

  // 处理流式渲染
  useEffect(() => {
    if (!isStreaming || !deferredStreamingText.trim()) {
      return;
    }
    renderMarkdownToHtml(deferredStreamingText).then(setStreamingHtml);
  }, [deferredStreamingText, isStreaming]);

  // 派生计算：确保在非流式或文本为空时，streamingHtml 逻辑上为空
  const effectiveStreamingHtml = isStreaming && deferredStreamingText.trim() ? streamingHtml : "";

  useLayoutEffect(() => {
    // 流式期间只让文本自然追加，避免高亮重写 DOM 导致打字机抖动。
    const container = containerRef.current;
    if (!container || isStreaming) return;

    // 异步执行代码块增强
    const enhance = async () => {
      await enhanceCodeBlocks(container);
    };

    enhance();
    
    const frameId = window.requestAnimationFrame(enhance);
    const settleTimerId = window.setTimeout(enhance, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimerId);
    };
  }, [html, isStreaming]);

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
      ) : isStreaming ? (
        effectiveStreamingHtml ? (
          <div
            className="markdown-body streaming-markdown"
            dangerouslySetInnerHTML={{ __html: effectiveStreamingHtml }}
          />
        ) : (
          <div className="markdown-body streaming-text">{text}</div>
        )
      ) : (
        <div
          ref={containerRef}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
});

const UserMessage = memo(function UserMessage({
  message,
}: {
  message: UiMessage;
}) {
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
});

export function ChatPanel({ messages, isStreaming }: ChatPanelProps) {
  return (
    <section className="chat-panel" aria-live="polite">
      {messages.map((message, index) => {
        // 只有最后一条助手消息在流式阶段需要显示特殊状态。
        // 判断是否显示「AI 正在打字」
        const assistantStreaming =
          message.role === "assistant" && // 是 AI 发的
          isStreaming && // 正在流式输出
          index === messages.length - 1; // 是最后一条

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

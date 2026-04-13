/**
 * 文件功能：底部输入区组件，承载输入、上传、发送、停止、主题切换和清空操作。
 * 设计思路：
 * 1. 组件只做视图与事件转发，不直接处理聊天业务，保持可复用与可测试。
 * 2. 输入发送能力由 canSend 派生计算，保证按钮状态与业务约束一致。
 * 3. 上传列表作为受控渲染，删除动作通过回调交给上层统一管理资源释放。
 */

import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import type { ThemeMode, UploadingImage } from "../types/chat";

interface ComposerProps {
  input: string;
  theme: ThemeMode;
  isStreaming: boolean;
  uploadingImages: UploadingImage[];
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onUploadClick: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (id: string) => void;
  onStop: () => void;
  onToggleTheme: () => void;
  onClearConversation: () => void;
}

export function Composer({
  input,
  theme,
  isStreaming,
  uploadingImages,
  messageInputRef,
  fileInputRef,
  onInputChange,
  onSend,
  onKeyDown,
  onUploadClick,
  onFileChange,
  onRemoveImage,
  onStop,
  onToggleTheme,
  onClearConversation,
}: ComposerProps) {
  // 文本非空或有待发送图片，且不在流式阶段时允许发送。
  const canSend =
    !isStreaming && (input.trim().length > 0 || uploadingImages.length > 0);

  return (
    <footer className="composer-wrap">
      {/* 上传预览区：展示发送前临时图片，并支持移除 */}
      <section className="upload-preview">
        {uploadingImages.map((item) => (
          <article key={item.id} className="preview-item">
            <img src={item.url} alt="上传图片预览" />
            <button
              className="remove-preview"
              type="button"
              title="移除"
              onClick={() => onRemoveImage(item.id)}
            >
              ×
            </button>
          </article>
        ))}
      </section>

      <div className="composer-row">
        <div className="composer">
          <textarea
            ref={messageInputRef}
            id="messageInput"
            value={input}
            placeholder="有问题尽管问我"
            rows={1}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
          />

          <div className="composer-actions">
            {/* 文件输入框保持隐藏，通过按钮触发点击 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onFileChange}
            />
            <button
              className="circle-btn"
              type="button"
              title="上传图片"
              onClick={onUploadClick}
            >
              📎
            </button>
            <button
              id="sendBtn"
              className={`circle-btn ${canSend ? "active" : ""}`}
              type="button"
              title="发送"
              onClick={onSend}
            >
              <span className="btn-glyph send-glyph">↑</span>
            </button>
            <button
              id="stopBtn"
              className={`circle-btn stop ${isStreaming ? "active" : ""}`}
              type="button"
              title="停止生成"
              onClick={onStop}
            >
              <span className="btn-glyph stop-glyph">■</span>
            </button>
          </div>
        </div>

        <div className="outer-actions">
          <button
            className="circle-btn"
            type="button"
            title="切换主题"
            onClick={onToggleTheme}
          >
            {theme === "light" ? "☾" : "☼"}
          </button>
          <button
            className="circle-btn"
            type="button"
            title="清空对话"
            onClick={onClearConversation}
          >
            🗑
          </button>
        </div>
      </div>

      <p className="tips">内容由 AI 大模型生成，请仔细甄别</p>
    </footer>
  );
}

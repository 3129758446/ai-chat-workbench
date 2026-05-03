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
  onThemeChange: (theme: ThemeMode) => void;
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
  onThemeChange,
  onClearConversation,
}: ComposerProps) {
  const canSend =
    !isStreaming && (input.trim().length > 0 || uploadingImages.length > 0);

  return (
    <footer className="composer-wrap">
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
            placeholder="有什么问题尽管问我"
            rows={1}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
          />

          <div className="composer-actions">
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
              +
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
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          >
            {theme === "light" ? "☀" : "☾"}
          </button>
          <button
            className="circle-btn"
            type="button"
            title="清空当前会话"
            onClick={onClearConversation}
          >
            ⌫
          </button>
        </div>
      </div>

      <p className="tips">内容由 AI 大模型生成，请仔细甄别</p>
    </footer>
  );
}

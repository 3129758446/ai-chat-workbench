/**
 * 文件功能：底部输入区组件，承载输入、上传、发送、停止、主题切换和清空操作。
 * 设计思路：
 * 1. 组件只做视图与事件转发，不直接处理聊天业务，保持可复用与可测试。
 * 2. 输入发送能力由 canSend 派生计算，保证按钮状态与业务约束一致。
 * 3. 上传列表作为受控渲染，删除动作通过回调交给上层统一管理资源释放。
 */

import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import type { ThemeMode, UploadingImage, UploadingTextFile } from "../types/chat";
import { formatFileSize } from "../utils/fileUpload";

interface ComposerProps {
  input: string;
  theme: ThemeMode;
  isStreaming: boolean; // AI 是否正在打字
  uploadingImages: UploadingImage[]; // 待发送图片列表
  uploadingFiles: UploadingTextFile[]; // 待发送文本文件列表
  messageInputRef: RefObject<HTMLTextAreaElement | null>; // 输入框 DOM 引用
  fileInputRef: RefObject<HTMLInputElement | null>; // 文件上传 DOM 引用
  onInputChange: (value: string) => void; // 输入框文字变化
  onSend: () => void; // 发送消息
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void; // 输入框按键事件
  onUploadClick: () => void; // 点击上传按钮，触发文件选择
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; // 文件选择后事件
  onRemoveImage: (id: string) => void; // 移除待发送图片
  onRemoveFile: (id: string) => void; // 移除待发送文本文件
  onStop: () => void; // 停止 AI 打字
  onThemeChange: (theme: ThemeMode) => void; // 切换主题
  onClearConversation: () => void; // 清空对话
}

export function Composer({
  input,
  theme,
  isStreaming,
  uploadingImages,
  uploadingFiles,
  messageInputRef,
  fileInputRef,
  onInputChange,
  onSend,
  onKeyDown,
  onUploadClick,
  onFileChange,
  onRemoveImage,
  onRemoveFile,
  onStop,
  onThemeChange,
  onClearConversation,
}: ComposerProps) {
  // 文本非空或有待发送图片，且不在流式阶段时允许发送。
  const hasReadyFile = uploadingFiles.some((file) => file.status === "ready");
  const canSend =
    !isStreaming &&
    (input.trim().length > 0 || uploadingImages.length > 0 || hasReadyFile);

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
        {uploadingFiles.map((item) => (
          <article
            key={item.id}
            className={`preview-file ${item.status} ${item.truncated ? "truncated" : ""}`}
          >
            <div className="preview-file-main">
              <span className="preview-file-icon">TXT</span>
              <div className="preview-file-copy">
                <strong title={item.name}>{item.name}</strong>
                <span>
                  {formatFileSize(item.size)} ·{" "}
                  {item.status === "parsing"
                    ? "解析中"
                    : item.status === "ready"
                      ? item.truncated
                        ? "已就绪，发送时会截断"
                        : "已就绪"
                      : "解析失败"}
                </span>
                {item.error ? <em>{item.error}</em> : null}
              </div>
            </div>
            <button
              className="remove-preview"
              type="button"
              title="移除"
              onClick={() => onRemoveFile(item.id)}
            >
              ×
            </button>
          </article>
        ))}
      </section>

      <div className="composer-row">
        <div className="composer">
          {/* 输入框 */}
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
            {/* 文件输入框保持隐藏，通过按钮触发点击 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.markdown,.json,.csv,.log,.js,.ts,.tsx,.jsx,.css,.html,.xml,.yaml,.yml,text/*,application/json"
              multiple
              hidden
              onChange={onFileChange}
            />
            <button
              className="circle-btn"
              type="button"
              title="上传图片或文本文件"
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

        {/* 外部操作按钮 */}
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

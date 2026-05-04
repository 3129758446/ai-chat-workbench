import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Composer } from "./Composer";
import React from "react";

/**
 * 组件测试：Composer.test.tsx
 * 目标：验证复杂表单组件的交互逻辑。
 * 大厂价值点：Composer 是交互密度最高的地方。测试覆盖了按钮状态切换、快捷键触发、文件移除等细节。
 */

describe("Composer 组件交互测试", () => {
  const defaultProps = {
    input: "",
    theme: "dark" as const,
    modelProvider: "auto" as const,
    isStreaming: false,
    uploadingImages: [],
    uploadingFiles: [],
    messageInputRef: {
      current: null,
    } as React.RefObject<HTMLTextAreaElement | null>,
    fileInputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onKeyDown: vi.fn(),
    onUploadClick: vi.fn(),
    onFileChange: vi.fn(),
    onRemoveImage: vi.fn(),
    onRemoveFile: vi.fn(),
    onStop: vi.fn(),
    onThemeChange: vi.fn(),
    onModelProviderChange: vi.fn(),
    onClearConversation: vi.fn(),
  };

  it("当输入为空且无附件时，发送按钮不应显示为 active", () => {
    render(<Composer {...defaultProps} />);
    const sendBtn = screen.getByTitle("发送");
    expect(sendBtn).not.toHaveClass("active");
  });

  it("当有输入内容时，发送按钮应显示为 active", () => {
    render(<Composer {...defaultProps} input="你好" />);
    const sendBtn = screen.getByTitle("发送");
    expect(sendBtn).toHaveClass("active");
  });

  it("点击发送按钮应触发 onSend 回调", () => {
    render(<Composer {...defaultProps} input="你好" />);
    const sendBtn = screen.getByTitle("发送");
    fireEvent.click(sendBtn);
    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it("正在流式生成时，发送按钮应被禁用 (通过 canSend 逻辑)", () => {
    render(<Composer {...defaultProps} input="你好" isStreaming={true} />);
    const sendBtn = screen.getByTitle("发送");
    expect(sendBtn).toBeDisabled();
    expect(sendBtn).not.toHaveClass("active");
  });

  it("渲染上传的图片预览并支持点击移除", () => {
    const uploadingImages = [
      { id: "img-1", file: {} as File, url: "test-url" },
    ];
    render(<Composer {...defaultProps} uploadingImages={uploadingImages} />);

    expect(screen.getByAltText("上传图片预览")).toBeInTheDocument();
    const removeBtn = screen.getByTitle("移除");
    fireEvent.click(removeBtn);
    expect(defaultProps.onRemoveImage).toHaveBeenCalledWith("img-1");
  });

  it("按下键盘按键应触发 onKeyDown 回调", () => {
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("有什么问题尽管问我");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(defaultProps.onKeyDown).toHaveBeenCalled();
  });
});

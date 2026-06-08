/**
 * 测试文件：fileUpload.longText.test.ts
 * 目标：验证长文本上传从固定截断升级为分块检索后的核心行为。
 * 覆盖思路：检查长文本模式、相关片段召回、中文检索词召回和 assist 模式的文件使用边界。
 */

import { describe, expect, it } from "vitest";
import {
  buildFileQuestionText,
  DIRECT_TEXT_CONTEXT_LIMIT,
  prepareParsedTextFile,
} from "./fileUpload";
import type { UploadingTextFile } from "../types/chat";

function fileWithText(
  text: string,
  patch: Partial<UploadingTextFile> = {},
): UploadingTextFile {
  return {
    id: "file-1",
    file: {} as File,
    name: "contract.txt",
    size: text.length,
    type: "text/plain",
    extension: "txt",
    status: "ready",
    text,
    createdAt: 1,
    ...patch,
  };
}

describe("long text file handling", () => {
  it("keeps small files in full mode", () => {
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "small.txt",
      text: "short content",
    });

    expect(payload.mode).toBe("full");
    expect(payload.text).toBe("short content");
    expect(payload.chunks).toBeUndefined();
    expect(payload.truncated).toBe(false);
  });

  it("stores long files as chunks instead of truncating the source text", () => {
    const text = "payment deadline clause.\n\n".repeat(
      Math.ceil((DIRECT_TEXT_CONTEXT_LIMIT + 1000) / 26),
    );

    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "long.txt",
      text,
    });

    expect(payload.mode).toBe("retrieval");
    expect(payload.text).toBe(text);
    expect(payload.chunks?.length).toBeGreaterThan(1);
    expect(payload.truncated).toBe(false);
  });

  it("injects related chunks for long files instead of the full file", () => {
    const text = [
      "General introduction.".repeat(500),
      "Payment deadline is 30 days after invoice approval.",
      "Unrelated appendix.".repeat(500),
    ].join("\n\n");
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "contract.txt",
      text,
    });
    const result = buildFileQuestionText("What is the payment deadline?", [
      fileWithText(text, payload),
    ]);

    expect(result).toContain("相关原文片段");
    expect(result).toContain("Payment deadline is 30 days");
    expect(result.length).toBeLessThan(text.length);
  });

  it("uses retrieval plan terms to find conceptually related chunks", () => {
    const text = [
      "General introduction.".repeat(500),
      "Invoice approval triggers settlement within 30 days.",
      "Unrelated appendix.".repeat(500),
    ].join("\n\n");
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "contract.txt",
      text,
    });
    const result = buildFileQuestionText(
      "When do we pay?",
      [fileWithText(text, payload)],
      {
        searchTerms: ["invoice approval", "settlement"],
      },
    );

    expect(result).toContain("Invoice approval triggers settlement");
  });

  it("injects Chinese mixed CSS inheritance excerpts from retrieval plan terms", () => {
    const text = [
      "# 前端复习资料\n\n",
      "React Hooks 和组件通信。\n\n".repeat(300),
      "## CSS 继承机制\n\nfont-size、color 等 CSS 属性会从父元素继承，margin、padding 等布局属性通常不会继承。\n\n",
      "Vue2 和 Vue3 响应式原理。\n\n".repeat(300),
    ].join("");
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "frontend.md",
      text,
    });
    const result = buildFileQuestionText(
      "你觉得里面说的 CSS 属性继承有什么可以扩展的吗",
      [fileWithText(text, payload)],
      {
        searchTerms: ["CSS 继承机制", "font-size", "color"],
      },
    );

    expect(result).toContain("CSS 继承机制");
    expect(result).toContain("CSS 属性会从父元素继承");
  });

  it("does not inject file context when mode is none", () => {
    const text = "HTTP 缓存和 Last-Modified 的内容。".repeat(500);
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "frontend.md",
      text,
    });
    const result = buildFileQuestionText(
      "Last-Modified",
      [fileWithText(text, payload)],
      undefined,
      "none",
    );

    expect(result).toBe("Last-Modified");
  });

  it("returns the original question in assist mode when file snippets are insufficient", () => {
    const text = "React 和 Vue 面试题。".repeat(500);
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "frontend.md",
      text,
    });
    const result = buildFileQuestionText(
      "结合我上传的资料讲讲 Last-Modified",
      [fileWithText(text, payload)],
      undefined,
      "assist",
    );

    expect(result).toBe("结合我上传的资料讲讲 Last-Modified");
  });

  it("does not add file excerpts in assist mode when retrieval has no match", () => {
    const text = "React 和 Vue 面试题。".repeat(500);
    const payload = prepareParsedTextFile({
      fileId: "file-1",
      fileName: "frontend.md",
      text,
    });
    const result = buildFileQuestionText(
      "怎么使用 C 语言打印字符串",
      [fileWithText(text, payload)],
      undefined,
      "assist",
    );

    expect(result).toBe("怎么使用 C 语言打印字符串");
  });
});

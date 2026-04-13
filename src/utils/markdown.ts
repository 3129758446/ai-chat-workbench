/**
 * 文件功能：Markdown 渲染增强模块，负责“解析 -> 净化 -> 高亮 -> 复制”。
 * 设计思路：
 * 1. 渲染链路分层：marked 负责语法解析，DOMPurify 负责安全净化。
 * 2. 高亮和复制按钮在渲染后做增强，避免与 markdown 解析耦合。
 * 3. 复制按钮按需注入并去重，支持流式更新时重复调用。
 */

import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { marked } from "marked";

// 配置 Markdown 行为为更贴近聊天场景的 GitHub 风格。
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 将 Markdown 文本渲染为安全 HTML。
export function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown || "");
  return DOMPurify.sanitize(String(rawHtml));
}

// 对容器内代码块做二次增强：代码高亮 + 复制按钮。
export function enhanceCodeBlocks(container: HTMLElement): void {
  const blocks = container.querySelectorAll("pre > code");
  blocks.forEach((codeEl) => {
    // 先执行语法高亮。
    hljs.highlightElement(codeEl as HTMLElement);

    const pre = codeEl.parentElement;
    if (!pre || pre.querySelector(".copy-btn")) {
      return;
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "复制";

    // 复制行为做短反馈，提升交互可感知性。
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent || "");
        copyBtn.textContent = "已复制";
      } catch {
        copyBtn.textContent = "复制失败";
      }
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    });

    pre.appendChild(copyBtn);
  });
}

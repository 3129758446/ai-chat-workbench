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

const FORBIDDEN_MARKDOWN_TAGS = [
  "button",
  "form",
  "input",
  "option",
  "select",
  "textarea",
];

// 配置 Markdown 行为为更贴近聊天场景的 GitHub 风格。
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 将 Markdown 文本渲染为安全 HTML。
// marked 解析结果可能包含用户输入的内容，必须经过 DOMPurify 净化以防 XSS 攻击。
export function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown || "");
  return DOMPurify.sanitize(String(rawHtml), {
    FORBID_TAGS: FORBIDDEN_MARKDOWN_TAGS,
  });
}

async function writeClipboardText(text: string): Promise<void> {
  // 优先使用 Clipboard API，失败时回退到 textarea 方案。
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function ensureCodeBlockWrapper(pre: HTMLElement): HTMLElement {
  const parent = pre.parentElement;
  if (parent?.classList.contains("code-block-wrapper")) {
    return parent;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "code-block-wrapper";
  pre.parentNode?.insertBefore(wrapper, pre);
  wrapper.appendChild(pre);
  return wrapper;
}

function getCodeLanguage(codeEl: HTMLElement): string {
  const languageClass = [...codeEl.classList].find((className) =>
    className.startsWith("language-"),
  );
  return String(languageClass || "").replace(/^language-/, "").toLowerCase();
}

function highlightCodeElement(codeEl: HTMLElement): void {
  if (codeEl.dataset.highlighted === "true") {
    return;
  }

  const text = codeEl.textContent || "";
  const language = getCodeLanguage(codeEl);

  try {
    const highlighted =
      language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value;

    codeEl.innerHTML = highlighted;
    codeEl.classList.add("hljs");
    codeEl.dataset.highlighted = "true";
  } catch {
    codeEl.textContent = text;
    codeEl.classList.add("hljs");
    codeEl.dataset.highlighted = "true";
  }
}

// 对容器内代码块做二次增强：代码高亮 + 复制按钮。
export function enhanceCodeBlocks(container: HTMLElement): void {
  // 1. 查找所有 code 块并执行语法高亮。
  const blocks = container.querySelectorAll("pre > code");

  blocks.forEach((codeEl) => {
    const codeElement = codeEl as HTMLElement;

    // 2. 先执行语法高亮，不让未知语言影响后续复制按钮注入。
    highlightCodeElement(codeElement);

    // 3. 如果代码块已存在复制按钮，则跳过。
    const pre = codeElement.parentElement;
    if (!pre) {
      return;
    }

    const wrapper = ensureCodeBlockWrapper(pre);
    if (wrapper.querySelector(".copy-btn")) {
      return;
    }

    // 4. 创建复制按钮，注入到代码块外层，避免被 pre 的滚动区域裁剪。
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "复制";

    // 5. 复制行为做短反馈，提升交互可感知性。
    copyBtn.addEventListener("click", async () => {
      try {
        // 使用 Clipboard API 复制代码内容，兼容性较好且无需额外库。
        await writeClipboardText(codeElement.textContent || "");
        copyBtn.textContent = "已复制";
      } catch {
        copyBtn.textContent = "复制失败";
      }
      window.setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    });

    wrapper.appendChild(copyBtn);
  });
}

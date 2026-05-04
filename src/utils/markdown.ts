/**
 * 文件功能：Markdown 渲染增强模块，负责“解析 -> 净化 -> 高亮 -> 复制”。
 * 设计思路：
 * 1. 渲染链路分层：marked 负责语法解析，DOMPurify 负责安全净化。
 * 2. 性能优化：采用动态导入 (Dynamic Import) 加载 marked 和 highlight.js，减少初始包体积。
 * 3. 高亮和复制按钮在渲染后做增强，避免与 markdown 解析耦合。
 */

import DOMPurify from "dompurify";
import type { HLJSApi } from "highlight.js";

// --- 动态导入定义 ---
// 注意：这里不使用顶层 import，而是定义类型，在需要时才加载
type MarkedModule = typeof import("marked");

let markedInstance: MarkedModule["marked"] | null = null;
let hljsInstance: HLJSApi | null = null;

const FORBIDDEN_MARKDOWN_TAGS = [
  "button",
  "form",
  "input",
  "option",
  "select",
  "textarea",
];

/**
 * 内部辅助：确保渲染引擎已加载
 * 演示“异步化加载”的核心逻辑
 */
async function loadRenderer() {
  if (markedInstance && hljsInstance) {
    return { marked: markedInstance, hljs: hljsInstance };
  }

  // 使用 Promise.all 并行加载两个重型库
  const [markedMod, hljsMod] = await Promise.all([
    import("marked"),
    import("highlight.js"),
  ]);

  markedInstance = markedMod.marked;
  hljsInstance = hljsMod.default;

  // 配置 Markdown 行为
  markedInstance.setOptions({
    gfm: true,
    breaks: true,
  });

  return { marked: markedInstance, hljs: hljsInstance };
}

/**
 * 将 Markdown 文本渲染为安全 HTML (异步版本)
 * 演示：调用方需要使用 await 或 .then()
 */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const { marked } = await loadRenderer();
  const rawHtml = await marked.parse(markdown || "");
  return DOMPurify.sanitize(String(rawHtml), {
    FORBID_TAGS: FORBIDDEN_MARKDOWN_TAGS,
  });
}

/**
 * 写入剪贴板工具
 */
async function writeClipboardText(text: string): Promise<void> {
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

/**
 * 确保代码块有包装层，用于定位复制按钮
 */
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

/**
 * 提取代码语言
 */
function getCodeLanguage(codeEl: HTMLElement): string {
  const languageClass = [...codeEl.classList].find((className) =>
    className.startsWith("language-"),
  );
  return String(languageClass || "")
    .replace(/^language-/, "")
    .toLowerCase();
}

/**
 * 执行语法高亮 (异步)
 */
async function highlightCodeElement(codeEl: HTMLElement): Promise<void> {
  if (codeEl.dataset.highlighted === "true") return;

  const { hljs } = await loadRenderer();
  const text = codeEl.textContent || "";
  const language = getCodeLanguage(codeEl);

  try {
    const highlighted =
      language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value;

    codeEl.innerHTML = highlighted;
  } catch {
    codeEl.textContent = text;
  } finally {
    codeEl.classList.add("hljs");
    codeEl.dataset.highlighted = "true";
  }
}

/**
 * 对容器内代码块做二次增强：代码高亮 + 复制按钮
 */
export async function enhanceCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll("pre > code");

  // 使用 Promise.all 并行处理所有代码块的高亮
  await Promise.all(
    Array.from(blocks).map(async (codeEl) => {
      const codeElement = codeEl as HTMLElement;

      // 1. 高亮
      await highlightCodeElement(codeElement);

      // 2. 注入复制按钮
      const pre = codeElement.parentElement;
      if (!pre) return;

      const wrapper = ensureCodeBlockWrapper(pre);
      if (wrapper.querySelector(".copy-btn")) return;

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "复制";

      copyBtn.addEventListener("click", async () => {
        try {
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
    }),
  );
}

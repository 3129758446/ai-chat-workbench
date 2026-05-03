import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }) => {
  const language = (lang || "").trim();
  const validLanguage = language && hljs.getLanguage(language) ? language : "";
  const highlighted = validLanguage
    ? hljs.highlight(text, { language: validLanguage }).value
    : hljs.highlightAuto(text).value;
  const languageClass = validLanguage ? ` language-${validLanguage}` : "";

  return [
    "<pre>",
    `<code class="hljs${languageClass}">${highlighted}</code>`,
    "</pre>",
  ].join("");
};

export function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown || "", { renderer });
  return DOMPurify.sanitize(String(rawHtml));
}

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

export function enhanceCodeBlocks(container: HTMLElement): void {
  const blocks = container.querySelectorAll("pre > code");

  blocks.forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.querySelector(".copy-btn")) {
      return;
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "复制";

    copyBtn.addEventListener("click", async () => {
      try {
        await writeClipboardText(codeEl.textContent || "");
        copyBtn.textContent = "已复制";
      } catch {
        copyBtn.textContent = "复制失败";
      }

      window.setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    });

    pre.appendChild(copyBtn);
  });
}

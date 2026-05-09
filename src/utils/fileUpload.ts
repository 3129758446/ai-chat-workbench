import type { UploadingTextFile } from "../types/chat";

export const MAX_TEXT_FILE_SIZE = 1024 * 1024;
export const MAX_TEXT_FILE_COUNT = 3;
export const MAX_FILE_CONTEXT_CHARS = 20_000;

const SUPPORTED_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "log",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "html",
  "xml",
  "yaml",
  "yml",
]);

const SUPPORTED_MIME_PREFIXES = ["text/"];
const SUPPORTED_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/typescript",
  "application/vnd.ms-excel",
]);

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getFileExtension(fileName: string): string {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments[segments.length - 1] : "";
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

// 检查文件是否为支持的文本文件类型。
export function isSupportedTextFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  const mime = file.type.toLowerCase();
  return (
    SUPPORTED_EXTENSIONS.has(extension) ||
    SUPPORTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) ||
    SUPPORTED_MIME_TYPES.has(mime)
  );
}

// 创建一个上传中的文本文件对象。
export function createUploadingTextFile(
  file: File,
  status: UploadingTextFile["status"] = "parsing",
  error?: string,
): UploadingTextFile {
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name || "未命名文件",
    size: file.size,
    type: file.type || "unknown",
    extension: getFileExtension(file.name),
    status,
    text: "",
    error,
    createdAt: Date.now(),
  };
}

// 验证文本文件是否符合要求。
export function validateTextFile(file: File): string | null {
  if (!isSupportedTextFile(file)) {
    return "不支持该文件类型，仅支持 txt、md、json、csv、log 和常见代码文本文件。";
  }

  if (file.size > MAX_TEXT_FILE_SIZE) {
    return `文件过大，单个文本文件不能超过 ${formatFileSize(MAX_TEXT_FILE_SIZE)}。`;
  }

  return null;
}

// 解析文本文件内容，返回文本字符串。
export async function parseTextFile(file: File): Promise<string> {
  if (typeof file.text !== "function") {
    throw new Error("当前浏览器不支持读取该文件，请更换浏览器后重试。");
  }

  const text = await file.text();
  if (!text.trim()) {
    throw new Error("文件内容为空，请选择包含文本内容的文件。");
  }

  return text;
}

// 构建包含文件内容的提示文本。
export function buildFileQuestionText(
  question: string,
  files: UploadingTextFile[],
): string {
  const readyFiles = files.filter((file) => file.status === "ready" && file.text.trim());
  if (!readyFiles.length) {
    return question;
  }

  const fallbackQuestion = question || "请总结我上传的文件内容。";
  let remaining = MAX_FILE_CONTEXT_CHARS;
  const blocks: string[] = [];
  let hasTruncated = false;

  readyFiles.forEach((file, index) => {
    if (remaining <= 0) {
      hasTruncated = true;
      return;
    }

    // 为每个文件补一段稳定的结构化头信息，方便模型区分“文件元信息”和“正文内容”。
    const header = [
      `[文件 ${index + 1}]`,
      `文件名：${file.name}`,
      `类型：${file.type || file.extension || "文本文件"}`,
      "内容：",
    ].join("\n");
    // 预先给 header 留出预算，避免文件正文把提示模板本身挤掉。
    const budget = Math.max(0, remaining - header.length - 2);
    const body = file.text.slice(0, budget);
    if (body.length < file.text.length) {
      hasTruncated = true;
    }

    blocks.push(`${header}\n${body}`);
    remaining -= header.length + body.length + 2;
  });

  const truncatedTip = hasTruncated
    ? "\n\n注意：由于上下文长度限制，部分文件内容已截断。"
    : "";

  // 最终 prompt 保持固定骨架，降低模型在多文件场景下答非所问的概率。
  return [
    "以下是用户上传的文件内容，请基于这些内容回答问题。",
    "",
    blocks.join("\n\n"),
    truncatedTip,
    "",
    `用户问题：${fallbackQuestion}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 文件功能：聊天请求服务层，负责端点选择、模型选择、流式解析与失败重试。
 * 设计思路：
 * 1. 服务层只关心“请求与响应”，不直接依赖 UI，便于复用和测试。
 * 2. 将端点回退与传输层错误判定放在统一入口，避免调用方重复处理。
 * 3. 通过 provider 区分灵犀/Qwen 与 DeepSeek，保持发送链路不感知底层厂商差异。
 * 4. SSE 解析采用增量拼接并回调 onDelta，满足聊天打字机式更新需求。
 */

import {
  API_BASE_URL_STORAGE,
  DEEPSEEK_API_ENDPOINT,
  DEEPSEEK_MODEL_NAME,
  DEFAULT_API_ENDPOINTS,
  MODEL_NAME,
  VISION_MODEL_NAME,
} from "../constants";
import type { ApiMessage } from "../types/chat";

export type ChatProvider = "lingxi" | "deepseek";

export interface ApiError extends Error {
  status?: number;
  endpoint?: string;
}

// 检查消息中是否存在图片片段，用于决定模型类型。
export function hasImageInMessages(messages: ApiMessage[]): boolean {
  return messages.some(
    (message) =>
      // 兼容 content 既有字符串又有结构化片段的情况
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url"),
  );
}

// 根据 provider 和消息内容动态切换模型。
export function resolveModelByMessages(
  provider: ChatProvider,
  messages: ApiMessage[],
): string {
  if (provider === "deepseek") {
    return DEEPSEEK_MODEL_NAME;
  }

  return hasImageInMessages(messages) ? VISION_MODEL_NAME : MODEL_NAME;
}

// 组装灵犀端点列表：自定义端点优先，默认端点作为回退。
export function getLingxiApiEndpoints(): string[] {
  const custom = String(
    localStorage.getItem(API_BASE_URL_STORAGE) || "",
  ).trim();
  if (!custom) {
    return [...DEFAULT_API_ENDPOINTS];
  }

  // 仅允许同源自定义地址，禁止浏览器直接请求跨域地址。
  let normalized = custom.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(normalized)) {
    const url = new URL(normalized);
    if (url.origin !== window.location.origin) {
      return [...DEFAULT_API_ENDPOINTS];
    }
    normalized = `${url.pathname}${url.search}${url.hash}`.replace(/\/+$/, "");
  }

  if (!normalized.startsWith("/")) {
    return [...DEFAULT_API_ENDPOINTS];
  }

  const customEndpoint = normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;

  return [customEndpoint, ...DEFAULT_API_ENDPOINTS].filter(
    (item, index, arr) => arr.indexOf(item) === index,
  );
}

function getApiEndpoints(provider: ChatProvider): string[] {
  if (provider === "deepseek") {
    return [DEEPSEEK_API_ENDPOINT];
  }

  return getLingxiApiEndpoints();
}

// 判断错误是否属于可重试的传输层异常。
export function isTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = String(error.message || "");
  return (
    error.name === "TypeError" ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("ERR_PROXY_CONNECTION_FAILED")
  );
}

async function streamByEndpoint(
  endpoint: string, // 请求的端点。
  provider: ChatProvider,
  apiKey: string,
  messages: ApiMessage[],
  signal: AbortSignal, // 请求取消信号。
  onDelta: (text: string) => void, // 每当接收到新的文本增量时的回调。
): Promise<string> {
  const response = await fetch(endpoint, {
    // 发起 POST 请求。返回的 response 可能是一个流式响应，也可能是一个完整的 JSON 响应，或者在错误情况下没有响应体。
    method: "POST",
    headers: {
      "Content-Type": "application/json", // 指定请求体的数据格式为 JSON。
      Authorization: `Bearer ${apiKey}`, // 添加 API 密钥到请求头。
    },
    body: JSON.stringify({
      model: resolveModelByMessages(provider, messages), // 根据 provider 和消息内容动态选择模型。
      stream: true, // 启用流式响应，允许服务器逐块发送数据。
      temperature: 0.7, // 可调整的生成随机性参数。
      messages: [
        // 构建请求体，包含系统提示和用户消息。
        {
          role: "system",
          content:
            "你是一个专业、友好的 AI 助手。输出尽量结构化，优先使用 Markdown。",
        },
        ...messages,
      ],
    }),
    signal, // 请求取消信号。
  });

  // 1. HTTP 错误（如 4xx/5xx）不进入流式解析，直接抛出异常由调用方处理。
  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`HTTP ${response.status} ${text}`) as ApiError;
    err.status = response.status;
    err.endpoint = endpoint;
    throw err;
  }

  // 2. 响应体为空则直接返回，无需处理。
  if (!response.body) {
    const err = new Error("响应体为空") as ApiError;
    err.endpoint = endpoint;
    throw err;
  }

  const contentType = response.headers.get("content-type") || "";
  // 3. 兼容非流式 JSON 响应。
  if (contentType.includes("application/json")) {
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content || "（空响应）";
    onDelta(text); // 直接回调完整文本，跳过流式增量。
    return text;
  }

  // 4. 流式响应：逐块读取并解析 SSE 格式，增量回调文本更新。
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  // 逐行解析流式响应。
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 最后一行可能不完整，保留在 buffer 中等待下一次读取。
    buffer = lines.pop() || "";

    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      // OpenAI 兼容 SSE：每行以 data: 开头，最终以 [DONE] 收尾。
      if (data === "[DONE]") {
        continue;
      }

      // 解析 JSON 增量，提取文本并回调更新。
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullText += delta; // 累计文本。
          onDelta(fullText); // 回调更新 UI，传递当前完整文本。
        }
      } catch {
        // Ignore invalid chunks.
      }
    }
  }

  return fullText;
}

// 多端点容错入口：仅在传输层错误时尝试下一个端点。
export async function streamChatCompletion(
  provider: ChatProvider,
  apiKey: string,
  messages: ApiMessage[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<string> {
  const endpoints = getApiEndpoints(provider);
  let lastError: ApiError | null = null;

  // 循环尝试每个端点，一个接口挂了自动试下一个。
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    try {
      return await streamByEndpoint(
        endpoint,
        provider,
        apiKey,
        messages,
        signal,
        onDelta,
      );
    } catch (error) {
      const typedError = error as ApiError;
      typedError.endpoint = typedError.endpoint || endpoint; // 确保错误对象包含触发错误的端点信息。
      lastError = typedError; // 记录最后一次错误。

      // 尝试下一个端点，但忽略非传输层错误。
      const hasNext = index < endpoints.length - 1;
      if (hasNext && isTransportError(error)) {
        continue;
      }
      throw typedError;
    }
  }

  throw lastError || new Error("请求失败：无可用接口端点");
}

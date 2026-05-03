import {
  API_BASE_URL_STORAGE,
  DEFAULT_API_ENDPOINTS,
  MODEL_NAME,
  VISION_MODEL_NAME,
} from "../constants";
import type { ApiMessage } from "../types/chat";

export interface ApiError extends Error {
  status?: number;
  endpoint?: string;
}

function hasImageInMessages(messages: ApiMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url"),
  );
}

function resolveModelByMessages(messages: ApiMessage[]): string {
  return hasImageInMessages(messages) ? VISION_MODEL_NAME : MODEL_NAME;
}

function getApiEndpoints(): string[] {
  const custom = String(localStorage.getItem(API_BASE_URL_STORAGE) || "").trim();
  if (!custom) {
    return [...DEFAULT_API_ENDPOINTS];
  }

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

function isTransportError(error: unknown): boolean {
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
  endpoint: string,
  apiKey: string,
  messages: ApiMessage[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModelByMessages(messages),
      stream: true,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "你是一个专业、友好的 AI 助手。输出尽量结构化，优先使用 Markdown。",
        },
        ...messages,
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`HTTP ${response.status} ${text}`) as ApiError;
    err.status = response.status;
    err.endpoint = endpoint;
    throw err;
  }

  if (!response.body) {
    const err = new Error("响应体为空") as ApiError;
    err.endpoint = endpoint;
    throw err;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content || "（空响应）";
    onDelta(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        continue;
      }

      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          onDelta(fullText);
        }
      } catch {
        // Ignore invalid chunks.
      }
    }
  }

  return fullText;
}

export async function streamChatCompletion(
  apiKey: string,
  messages: ApiMessage[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<string> {
  const endpoints = getApiEndpoints();
  let lastError: ApiError | null = null;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    try {
      return await streamByEndpoint(endpoint, apiKey, messages, signal, onDelta);
    } catch (error) {
      const typedError = error as ApiError;
      typedError.endpoint = typedError.endpoint || endpoint;
      lastError = typedError;

      const hasNext = index < endpoints.length - 1;
      if (hasNext && isTransportError(error)) {
        continue;
      }
      throw typedError;
    }
  }

  throw lastError || new Error("请求失败：无可用接口端点");
}

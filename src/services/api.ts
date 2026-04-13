/**
 * 文件功能：聊天请求服务层，负责端点选择、模型选择、流式解析与失败重试。
 * 设计思路：
 * 1. 服务层只关心“请求与响应”，不直接依赖 UI，便于复用和测试。
 * 2. 将端点回退与传输层错误判定放在统一入口，避免调用方重复处理。
 * 3. 消息中含图片时自动切换视觉模型，实现对多模态输入的透明支持。
 * 4. SSE 解析采用增量拼接并回调 onDelta，满足聊天打字机式更新需求。
 */

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

// 检查消息中是否存在图片片段，用于决定模型类型。
function hasImageInMessages(messages: ApiMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url"),
  );
}

// 根据消息内容动态切换文本模型/视觉模型。
function resolveModelByMessages(messages: ApiMessage[]): string {
  return hasImageInMessages(messages) ? VISION_MODEL_NAME : MODEL_NAME;
}

// 组装端点列表：自定义端点优先，默认端点作为回退。
function getApiEndpoints(): string[] {
  const custom = String(
    localStorage.getItem(API_BASE_URL_STORAGE) || "",
  ).trim();
  if (!custom) {
    return [...DEFAULT_API_ENDPOINTS];
  }

  const normalized = custom.replace(/\/+$/, "");
  const customEndpoint = normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;

  return [customEndpoint, ...DEFAULT_API_ENDPOINTS].filter(
    (item, idx, arr) => arr.indexOf(item) === idx,
  );
}

// 判断错误是否属于可重试的传输层异常。
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

// 单端点请求：负责发起请求并把 SSE 流解析为连续文本。
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
  // 兼容非流式 JSON 响应。
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
      // OpenAI 兼容 SSE：每行以 data: 开头，最终以 [DONE] 收尾。
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
        // Ignore invalid JSON chunks.
      }
    }
  }

  return fullText;
}

// 多端点容错入口：仅在传输层错误时尝试下一个端点。
export async function streamChatCompletion(
  apiKey: string,
  messages: ApiMessage[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<string> {
  const endpoints = getApiEndpoints();
  let lastError: ApiError | null = null;

  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    try {
      return await streamByEndpoint(
        endpoint,
        apiKey,
        messages,
        signal,
        onDelta,
      );
    } catch (error) {
      const typedError = error as ApiError;
      typedError.endpoint = typedError.endpoint || endpoint;
      lastError = typedError;

      const hasNext = i < endpoints.length - 1;
      if (hasNext && isTransportError(error)) {
        continue;
      }
      throw typedError;
    }
  }

  throw lastError || new Error("请求失败：无可用接口端点");
}

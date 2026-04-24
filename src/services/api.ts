/**
 * 文件功能：聊天请求服务层，负责端点选择、模型选择、流式解析与失败重试。
 * 设计思路：
 * 1. 服务层只关心“请求与响应”，不直接依赖 UI，便于复用和测试。
 * 2. 将端点回退与传输层错误判定放在统一入口，避免调用方重复处理。
 * 3. 消息中含图片时自动切换视觉模型，实现对多模态输入的透明支持。
 * 4. SSE 解析采用增量拼接并回调 onDelta，满足聊天打字机式更新需求。
 */
// 负责：发起请求 → 接收流式文字 → 解析 SSE → 一段段推给 UI → 打字机效果

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
      Array.isArray(message.content) && // 兼容 content 既有字符串又有结构化片段的情况
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

  // 仅允许同源自定义地址，禁止浏览器直接请求跨域地址。
  let normalized = custom.replace(/\/+$/, ""); // 去除末尾斜杠，保持一致性。
  if (/^https?:\/\//i.test(normalized)) { // 兼容自定义地址为相对路径的情况。
    const url = new URL(normalized); // 把绝对 URL 解析为 URL 对象。意义：安全地读取 origin、pathname、search、hash，不靠字符串硬切
    if (url.origin !== window.location.origin) { //若不是同源，直接回退默认端点列表。意义：拒绝外域自定义地址，避免浏览器发起跨域请求。
      return [...DEFAULT_API_ENDPOINTS];
    }
    normalized = `${url.pathname}${url.search}${url.hash}`.replace(/\/+$/, ""); // 只保留路径部分，去除协议和域名，确保后续请求走当前站点域名。
  }

//  校验 normalized 是否以 / 开头。
// 意义：只接受站内路径，像 abc.com 或 api 这种都不允许。
  if (!normalized.startsWith("/")) {
    return [...DEFAULT_API_ENDPOINTS];
  }

  const customEndpoint = normalized.endsWith("/chat/completions") // 兼容自定义地址为 /chat/completions 的情况。
    ? normalized
    : `${normalized}/chat/completions`;

  // 将自定义端点放在默认端点前面，形成优先级顺序。使用 filter 去重，避免重复添加相同的端点。
  return [customEndpoint, ...DEFAULT_API_ENDPOINTS].filter( 
    (item, idx, arr) => arr.indexOf(item) === idx, 
  );
}

// 判断错误是否属于可重试的传输层异常。
function isTransportError(error: unknown): boolean {
  // 1. 仅当错误对象具有 message 属性时才进行进一步检查，避免非错误对象引起的异常。
  if (!(error instanceof Error)) {
    return false;
  }
  // 2. 通过错误类型和消息内容判断是否为网络相关错误，兼容不同浏览器和环境的错误表现。
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
  endpoint: string, // 请求的端点。
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
      model: resolveModelByMessages(messages), // 根据消息内容动态选择模型。
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

  console.log(response);

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

  // 3. 响应体非 JSON 则直接返回，无需处理。
  const contentType = response.headers.get("content-type") || "";
  // 兼容非流式 JSON 响应。
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
    // 1. 逐行解析。
    // 2. 忽略空行。
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 最后一行可能不完整，保留在 buffer 中等待下一次读取。
    // 3. 遍历每一行。
    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line.startsWith("data:")) {
        // 忽略非 data: 开头的行。
        continue;
      }
      // OpenAI 兼容 SSE：每行以 data: 开头，最终以 [DONE] 收尾。
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        continue;
      }

      // 解析 JSON 增量，提取文本并回调更新。
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || ""; // 本次增量文本。
        if (delta) {
          fullText += delta; // 累计文本。
          onDelta(fullText); // 回调更新 UI，传递当前完整文本。
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

  // 循环尝试每个端点 一个接口挂了自动试下一个，项目稳定性极强！
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
      const typedError = error as ApiError; // 规范化错误对象，确保包含 endpoint 信息。
      typedError.endpoint = typedError.endpoint || endpoint; // 确保错误对象包含触发错误的端点信息。
      lastError = typedError; // 记录最后一次错误。

      // 尝试下一个端点，但忽略非传输层错误。
      const hasNext = i < endpoints.length - 1;
      if (hasNext && isTransportError(error)) {
        continue;
      }
      throw typedError;
    }
  }

  throw lastError || new Error("请求失败：无可用接口端点");
}

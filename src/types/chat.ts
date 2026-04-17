/**
 * 文件功能：定义聊天域的核心类型（角色、消息结构、上传资源、主题）。
 * 设计思路：
 * 1. 先定义“领域模型”再实现状态和组件，避免业务含义只存在于实现细节中。
 * 2. API 消息与 UI 消息分离：前者服务模型请求，后者服务页面展示，降低耦合。
 * 3. 多模态消息采用联合类型，显式区分 text/image_url，便于编译期约束。
 */

export type Role = "user" | "assistant";

export type ThemeMode = "dark" | "light";

// 图片消息片段，遵循 OpenAI 兼容格式中的 image_url 结构。
export interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

// 文本消息片段。
export interface TextPart {
  type: "text";
  text: string;
}

// 消息内容片段，可以是文本或图片，支持多模态输入。
export type MessagePart = ImagePart | TextPart;

// 提交给模型的消息结构（可为纯文本，也可为多模态片段数组）。
export interface ApiMessage {
  role: Role; // 消息角色，决定模型响应风格。
  content: string | MessagePart[];
}

// 前端页面展示用消息结构。
export interface UiMessage {
  id: string;
  role: Role;
  text: string; // 消息内容，用于页面展示。
  content?: MessagePart[]; // 可选的多模态内容片段，保留原始结构以支持图片展示。
}

// 本地上传图片的中间态，url 用于预览，file 用于最终编码发送。
export interface UploadingImage {
  id: string;
  file: File;
  url: string;
}

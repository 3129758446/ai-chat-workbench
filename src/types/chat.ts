/**
 * 文件功能：定义聊天域的核心类型（角色、消息结构、上传资源、主题、会话）。
 * 设计思路：
 * 1. 先定义“领域模型”再实现状态和组件，避免业务含义只存在于实现细节中。
 * 2. API 消息与 UI 消息分离：前者服务模型请求，后者服务页面展示，降低耦合。
 * 3. 多模态消息采用联合类型，显式区分 text/image_url，便于编译期约束。
 * 4. 会话实体单独建模，为多会话状态管理和持久化提供稳定边界。
 */

export type Role = "user" | "assistant";

export type ThemeMode = "dark" | "light";

// 模型选择模式：支持自动选择、固定走灵犀/Qwen、固定走 DeepSeek。
export type ModelProviderMode = "auto" | "lingxi" | "deepseek";

export interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

export interface TextPart {
  type: "text";
  text: string;
}

export type MessagePart = ImagePart | TextPart;

export interface ApiMessage {
  role: Role;
  content: string | MessagePart[];
}

export interface UiMessage {
  id: string;
  role: Role;
  text: string;
  content?: MessagePart[];
}

export interface UploadingImage {
  id: string;
  file: File;
  url: string;
}

export type UploadingFileStatus = "parsing" | "ready" | "error";

// 上传中的文本文件，包含文件元数据和解析状态。
export interface UploadingTextFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  extension: string;
  status: UploadingFileStatus;
  text: string;
  error?: string;
  truncated?: boolean;
  createdAt: number;
}

// 会话实体，包含所有会话相关状态。
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview: string;
  draftInput: string;
  messages: UiMessage[];
  chatHistory: ApiMessage[];
  uploadingImages: UploadingImage[];
  uploadingFiles: UploadingTextFile[];
  isStreaming: boolean;
}

// 会话草稿，包含基本属性，不包含运行态对象。
// 用于持久化层保存会话状态，避免保存 File、AbortController 等运行态对象。
export interface ConversationDraft {
  id: string; // 会话 ID，默认值为随机字符串。
  title: string; // 会话标题，默认值为 "New Conversation"。
  createdAt: number; // 创建时间，用于排序。
  updatedAt: number; // 最后一次更新时间，用于排序。
  lastMessagePreview: string; // 最后一条消息预览，默认值为空字符串。
  draftInput: string; // 草稿输入，用于保存用户输入的文本。
  messages: UiMessage[]; // 聊天记录，包含所有消息。
  chatHistory: ApiMessage[]; // 聊天历史记录，包含所有 API 消息。
}

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

export interface ConversationDraft {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview: string;
  draftInput: string;
  messages: UiMessage[];
  chatHistory: ApiMessage[];
}

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

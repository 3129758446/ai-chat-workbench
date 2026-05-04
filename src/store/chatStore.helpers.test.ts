/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  normalizeTheme,
  previewFromContent,
  shorten,
  createConversationRecord,
  deriveConversationPatch,
} from "./chatStore.helpers";
import type { ApiMessage, Conversation } from "../types/chat";

/**
 * 测试文件：chatStore.helpers.test.ts
 * 目标：验证 Store 辅助逻辑的正确性。
 * 大厂价值点：Store 辅助函数决定了 UI 的状态展示（如标题生成），测试这些逻辑能保证用户体验的一致性。
 */

describe("chatStore.helpers.ts 辅助逻辑测试", () => {
  describe("normalizeTheme", () => {
    it("应正确归一化主题字符串", () => {
      expect(normalizeTheme("light")).toBe("light");
      expect(normalizeTheme("dark")).toBe("dark");
      expect(normalizeTheme("random")).toBe("dark");
      expect(normalizeTheme(null)).toBe("dark");
    });
  });

  describe("previewFromContent", () => {
    it("处理纯文本内容", () => {
      expect(previewFromContent(" Hello ")).toBe("Hello");
    });

    it("处理结构化消息片段", () => {
      const content: ApiMessage["content"] = [
        { type: "text", text: "Part 1" },
        { type: "image_url", image_url: { url: "..." } },
        { type: "text", text: "Part 2" },
      ];
      expect(previewFromContent(content)).toBe("Part 1 Part 2");
    });

    it("只有图片时返回图片摘要", () => {
      const content: ApiMessage["content"] = [
        { type: "image_url", image_url: { url: "..." } },
        { type: "image_url", image_url: { url: "..." } },
      ];
      expect(previewFromContent(content)).toBe("[图片] 2 张");
    });
  });

  describe("shorten", () => {
    it("正确截断长文本并添加省略号", () => {
      expect(shorten("A".repeat(100), 10)).toBe("A".repeat(10) + "...");
      expect(shorten("Short text", 20)).toBe("Short text");
    });

    it("压缩空白字符", () => {
      expect(shorten("  Many    Spaces  ")).toBe("Many Spaces");
    });
  });

  describe("createConversationRecord", () => {
    it("应生成符合结构的初始化会话对象", () => {
      const conv = createConversationRecord("test-id", "Test Title");
      expect(conv.id).toBe("test-id");
      expect(conv.title).toBe("Test Title");
      expect(Array.isArray(conv.messages)).toBe(true);
      expect(conv.isStreaming).toBe(false);
    });
  });

  describe("deriveConversationPatch", () => {
    it("基于首条用户消息推导标题和预览", () => {
      const conversation: Conversation = {
        ...createConversationRecord(),
        chatHistory: [
          {
            role: "user",
            content:
              "这是一条非常非常长的问题，长度已经超过了二十四个字符的限制",
          },
          { role: "assistant", content: "这是回答" },
        ],
      };

      const patch = deriveConversationPatch(conversation);
      expect(patch.title).toBe(
        "这是一条非常非常长的问题，长度已经超过了二十四个...",
      );
      expect(patch.lastMessagePreview).toBe("这是回答");
    });
  });
});

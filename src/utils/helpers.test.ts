import { describe, it, expect } from "vitest";
import { normalizeApiKey, escapeHtml, uid } from "./helpers";

/**
 * 测试文件：helpers.test.ts
 * 目标：验证通用工具函数的准确性。
 * 大厂价值点：展示对基础逻辑的严谨态度，确保边界情况（如空输入、特殊字符）得到正确处理。
 */

describe("helpers.ts 工具函数测试", () => {
  
  describe("normalizeApiKey", () => {
    it("应该移除 Bearer 前缀 (不区分大小写)", () => {
      expect(normalizeApiKey("Bearer sk-123")).toBe("sk-123");
      expect(normalizeApiKey("bearer sk-123")).toBe("sk-123");
    });

    it("应该移除首尾空格", () => {
      expect(normalizeApiKey("  sk-123  ")).toBe("sk-123");
    });

    it("空输入应返回空字符串", () => {
      expect(normalizeApiKey(null)).toBe("");
      expect(normalizeApiKey("")).toBe("");
    });
  });

  describe("escapeHtml", () => {
    it("应该转义关键 HTML 字符", () => {
      const input = '<script>alert("xss")</script> & more';
      const output = "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; more";
      expect(escapeHtml(input)).toBe(output);
    });
  });

  describe("uid", () => {
    it("应该生成带有指定前缀的 ID", () => {
      const id = uid("test");
      expect(id.startsWith("test-")).toBe(true);
    });

    it("多次调用生成的 ID 应该不同", () => {
      const id1 = uid();
      const id2 = uid();
      expect(id1).not.toBe(id2);
    });
  });
});

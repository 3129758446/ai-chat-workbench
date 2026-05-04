/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  hasImageInMessages, 
  resolveModelByMessages, 
  getLingxiApiEndpoints, 
  isTransportError 
} from "./api";
import { 
  MODEL_NAME, 
  VISION_MODEL_NAME, 
  DEEPSEEK_MODEL_NAME,
  DEFAULT_API_ENDPOINTS,
  API_BASE_URL_STORAGE
} from "../constants";
import type { ApiMessage } from "../types/chat";

/**
 * 测试文件：api.test.ts
 * 目标：验证请求服务层的逻辑正确性。
 * 大厂价值点：大厂面试官非常看重对“多厂商模型切换逻辑”和“网络异常重试策略”的掌控力。
 */

describe("api.ts 业务逻辑测试", () => {
  
  describe("hasImageInMessages", () => {
    it("检测到图片片段应返回 true", () => {
      const messages: ApiMessage[] = [
        { role: "user", content: [{ type: "image_url", image_url: { url: "..." } }] }
      ];
      expect(hasImageInMessages(messages)).toBe(true);
    });

    it("只有文本片段应返回 false", () => {
      const messages: ApiMessage[] = [
        { role: "user", content: "Hello" },
        { role: "user", content: [{ type: "text", text: "Hi" }] }
      ];
      expect(hasImageInMessages(messages)).toBe(false);
    });
  });

  describe("resolveModelByMessages", () => {
    it("DeepSeek provider 应始终返回 DeepSeek 模型", () => {
      expect(resolveModelByMessages("deepseek", [])).toBe(DEEPSEEK_MODEL_NAME);
    });

    it("灵犀有图片时应使用 Vision 模型", () => {
      const messages: ApiMessage[] = [
        { role: "user", content: [{ type: "image_url", image_url: { url: "..." } }] }
      ];
      expect(resolveModelByMessages("lingxi", messages)).toBe(VISION_MODEL_NAME);
    });

    it("灵犀无图片时应使用基础模型", () => {
      expect(resolveModelByMessages("lingxi", [])).toBe(MODEL_NAME);
    });
  });

  describe("getLingxiApiEndpoints", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.stubGlobal("location", { origin: "http://localhost:3000" });
    });

    it("没有自定义地址时应返回默认端点", () => {
      const endpoints = getLingxiApiEndpoints();
      expect(endpoints).toEqual(DEFAULT_API_ENDPOINTS);
    });

    it("自定义合法同源地址应排在首位", () => {
      localStorage.setItem(API_BASE_URL_STORAGE, "/api/custom");
      const endpoints = getLingxiApiEndpoints();
      expect(endpoints[0]).toBe("/api/custom/chat/completions");
      expect(endpoints.length).toBeGreaterThan(DEFAULT_API_ENDPOINTS.length);
    });

    it("非同源地址应被忽略并回退到默认", () => {
      localStorage.setItem(API_BASE_URL_STORAGE, "https://malicious-site.com/api");
      const endpoints = getLingxiApiEndpoints();
      expect(endpoints).toEqual(DEFAULT_API_ENDPOINTS);
    });
  });

  describe("isTransportError", () => {
    it("TypeError (Failed to fetch) 应判定为传输层错误", () => {
      const err = new TypeError("Failed to fetch");
      expect(isTransportError(err)).toBe(true);
    });

    it("普通的业务 Error 不应判定为传输层错误", () => {
      const err = new Error("401 Unauthorized");
      expect(isTransportError(err)).toBe(false);
    });
  });
});

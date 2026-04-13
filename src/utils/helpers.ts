/**
 * 文件功能：通用工具函数集合，承载与业务弱相关但高复用的能力。
 * 设计思路：
 * 1. 将“纯函数/轻副作用函数”集中到工具层，避免在组件内重复实现。
 * 2. 工具函数保持单一职责：Key 规范化、HTML 转义、滚动控制、ID 生成。
 * 3. 尽量保持输入输出可预期，便于后续单元测试与行为复用。
 */

import { API_KEY_STORAGE } from "../constants";

// 统一清洗 API Key，兼容用户输入 Bearer 前缀的场景。
export function normalizeApiKey(raw: string | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "");
}

// 从 localStorage 读取并返回可直接用于请求头的 Key。
export function ensureApiKey(): string {
  return normalizeApiKey(localStorage.getItem(API_KEY_STORAGE));
}

// 在需要拼接到 HTML 的错误信息等文本场景中防止注入。
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 延迟到下一帧滚动，避免与当前批次 DOM 更新抢时序导致滚动高度不准确。
export function scrollToBottom(): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

// 轻量唯一 ID，满足前端会话级唯一性即可。
export function uid(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

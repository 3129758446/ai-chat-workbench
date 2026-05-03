/**
 * 文件功能：集中维护项目运行时常量（端点、模型、存储键、快捷问题）。
 * 设计思路：
 * 1. 所有“跨模块共享且相对稳定”的值统一放在常量文件，减少魔法字符串散落。
 * 2. 网络端点以数组形式定义，配合 API 层的重试逻辑实现降级容错。
 * 3. 本地存储键统一命名，便于后续做设置面板或数据迁移。
 * 4. UI 预置文案集中管理，保证组件层只负责展示和交互。
 */

export const DEFAULT_API_ENDPOINTS = [
  "/api/chat/completions",
  "/api-intl/chat/completions",
];

export const MODEL_NAME = "qwen-turbo";
export const VISION_MODEL_NAME = "qwen-vl-plus";

export const API_KEY_STORAGE = "LINGXI_API_KEY";
export const API_BASE_URL_STORAGE = "LINGXI_API_BASE_URL";
export const THEME_STORAGE = "LINGXI_THEME";
export const CHAT_STORE_STORAGE = "LINGXI_CHAT_STORE";

export const QUICK_PROMPTS = [
  "我是一名前端开发初学者，如何提升相关技能？",
  "有哪些平价又新颖的生日礼物适合送朋友？",
  "准备在家里办一个大型家庭聚会，帮我计划。",
  "带小朋友去野营，有什么好玩的活动建议吗？",
] as const;

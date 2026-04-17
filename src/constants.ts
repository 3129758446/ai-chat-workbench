/**
 * 文件功能：集中维护项目运行时常量（端点、模型、存储键、快捷问题）。
 * 设计思路：
 * 1. 所有“跨模块共享且相对稳定”的值统一放在常量文件，减少魔法字符串散落。
 * 2. 网络端点以数组形式定义，配合 API 层的重试逻辑实现降级容错。
 * 3. 本地存储键统一命名，便于后续做设置面板或数据迁移。
 * 4. UI 预置文案集中管理，保证组件层仅负责展示和交互。
 */

// 默认接口端点：优先国内，失败后自动回退到国际端点。
export const DEFAULT_API_ENDPOINTS = [
  "/api/chat/completions",
  "/api-intl/chat/completions",
];

// 文本模型：用于纯文字对话。
export const MODEL_NAME = "qwen-turbo";
// 视觉模型：当消息中包含图片时自动切换到该模型。
export const VISION_MODEL_NAME = "qwen-vl-plus";

// 本地存储键：用户 API Key。
export const API_KEY_STORAGE = "LINGXI_API_KEY";
// 本地存储键：用户自定义 API Base URL。
export const API_BASE_URL_STORAGE = "LINGXI_API_BASE_URL";
// 本地存储键：主题模式。
export const THEME_STORAGE = "LINGXI_THEME";

// 欢迎页快捷提问卡片。
export const QUICK_PROMPTS = [
  "我是一名前端开发初学者，如何提升相关技能？",
  "有哪些平价又新颖的生日礼物适合送朋友？",
  "准备在家里办一个大型家庭聚会，帮我计划。",
  "带小朋友去野餐，有什么好玩的活动建议吗？",
] as const;

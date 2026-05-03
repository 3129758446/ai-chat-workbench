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

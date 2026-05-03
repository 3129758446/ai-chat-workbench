/**
 * 文件功能：作为 store 目录的统一出口，屏蔽内部模块拆分细节。
 * 设计思路：
 * 1. 业务层只依赖 `store/index.ts`，后续内部重构时可最大限度减少 import 变更。
 * 2. 同时导出 hook 和类型，方便调用方按需获取 store API 与类型约束。
 */

export { useChatStore } from "./chatStore";
export type { ChatState, PersistedChatState } from "./chatStore.types";

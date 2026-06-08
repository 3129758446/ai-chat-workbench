/**
 * 文件功能：判断当前用户问题应该如何使用已上传文件。
 * 实现思路：
 * 1. strict：用户明确要求“只根据文件/文件里有没有”，回答应严格受文件材料约束。
 * 2. assist：用户表示“结合文件/里面提到”，文件作为辅助上下文参与回答。
 * 3. none：普通问题不主动绑定文件，避免后续聊天被上传材料过度牵引。
 */

export type FileContextMode = "none" | "assist" | "strict";

const STRICT_PATTERNS = [
  /文件里.*(有没有|是否|提到|讲|写)/,
  /文档里.*(有没有|是否|提到|讲|写)/,
  /资料里.*(有没有|是否|提到|讲|写)/,
  /只根据/,
  /仅根据/,
  /严格.*(文件|文档|资料)/,
  /根据这个\s*(md|markdown|文件|文档)/i,
];

const ASSIST_PATTERNS = [
  /结合.*(文件|文档|资料|上传)/,
  /(文件|文档|资料|上传).*结合/,
  /里面说的/,
  /里面提到/,
  /上传.*(内容|资料|文件)/,
  /根据.*(文件|文档|资料).*(扩展|补充|解释|讲讲)/,
];

// 根据用户问题匹配关键词，判断文件上下文的使用策略。
export function resolveFileContextPolicy(question: string): FileContextMode {
  const normalized = question.trim();
  if (!normalized) {
    // 空问题通常发生在用户只上传文件并点击发送，此时默认把文件作为待总结材料。
    return "assist";
  }

  if (STRICT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "strict";
  }

  if (ASSIST_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "assist";
  }

  return "none";
}

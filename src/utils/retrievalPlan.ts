/**
 * 文件功能：生成和解析“AI 辅助检索词”。
 * 实现思路：
 * 1. 本地关键词检索无法完整理解同义词、上位词和概括词，所以让模型只补充 searchTerms。
 * 2. 模型不直接回答用户问题，只输出检索词 JSON，避免把答案生成和片段召回混在一起。
 * 3. 如果模型输出解析失败，就回退到本地关键词，保证长文本问答不会因为检索词生成失败而中断。
 */

import type { RetrievalPlan } from "./documentRetrieval";
import { extractSearchTerms } from "./documentRetrieval";

interface RetrievalPlanPromptFile {
  name: string;
  summary?: string;
}

export function createFallbackRetrievalPlan(question: string): RetrievalPlan {
  return {
    searchTerms: extractSearchTerms(question),
  };
}

export function parseRetrievalPlanResponse(text: string): RetrievalPlan | null {
  // 兼容模型在 JSON 外包了一层说明文字的情况，解析失败时交给调用方 fallback。
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    const json = JSON.parse(match[0]) as {
      searchTerms?: unknown;
    };
    const searchTerms = Array.isArray(json.searchTerms)
      ? json.searchTerms
          .map((term) => String(term).trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    return searchTerms.length ? { searchTerms } : null;
  } catch {
    return null;
  }
}

export function buildRetrievalPlanPrompt({
  question,
  files,
}: {
  question: string;
  files: RetrievalPlanPromptFile[];
}): string {
  const fileLines = files
    .map((file, index) =>
      [
        `文件 ${index + 1}：${file.name}`,
        file.summary ? `摘要/预览：${file.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [
    "只返回 JSON。请为用户问题生成一组检索词，用来从上传的长文本文件中找到相关原文片段。",
    "不要编造专有名词。优先使用用户问题、文件名、文件摘要/预览中出现的概念。",
    "searchTerms 最多 12 个，尽量包含同义表达、上位词、下位词和与问题相关的关键概念。",
    "",
    fileLines,
    "",
    `用户问题：${question}`,
    "",
    'JSON 格式：{"searchTerms":["检索词"]}',
  ].join("\n");
}

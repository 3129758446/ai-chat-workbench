/**
 * 文件功能：提供“无向量库版 RAG”的本地检索能力。
 * 实现思路：
 * 1. 先从用户问题里抽取英文技术词、数字词和中文 n-gram，形成一组轻量检索词。
 * 2. 再用检索词给每个文本 chunk 打分，命中词越多、命中次数越多，分数越高。
 * 3. 最后按分数挑选 topK 片段，并用 maxChars 控制注入 prompt 的总长度。
 * 这个文件只负责“召回相关原文片段”，不负责直接生成答案。
 */

import type { DocumentChunk } from "./textChunking";

export interface RetrievalOptions {
  question: string;
  searchTerms: string[]; // 从用户问题抽取的检索词，优先使用它们进行相关性判断；如果没有，retrieveRelevantChunks 内部会从问题里重新抽取。
  topK: number;
  maxChars: number;
}

export interface RetrievalPlan {
  searchTerms: string[]; // 检索词，用于计算 chunk 的相关度得分。
}

export interface ScoredDocumentChunk {
  chunk: DocumentChunk; // 文档片段
  score: number;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "is",
  "of",
  "the",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
  "how",
]);

// 将 term 推入 terms 数组，要求去重、忽略空字符串，并统一小写。
function pushUnique(terms: string[], term: string): void {
  const normalized = term.toLowerCase().trim();
  if (normalized && !terms.includes(normalized)) {
    terms.push(normalized);
  }
}

// 收集中文 n-gram。中文没有天然空格分词，用 4/3/2 字滑窗补足“属性继承”这类短语召回。
function collectChineseNgrams(terms: string[], text: string): void {
  const sequences = text.match(/[\p{Script=Han}]+/gu) || [];

  sequences.forEach((sequence) => {
    // 中文没有天然空格分词，用 4/3/2 字滑窗补足“属性继承”这类短语召回。
    [4, 3, 2].forEach((size) => {
      if (sequence.length < size) {
        return;
      }
      for (let index = 0; index <= sequence.length - size; index += 1) {
        pushUnique(terms, sequence.slice(index, index + size));
      }
    });
  });
}

// 抽取英文技术词、数字词和中文 n-gram，形成一组轻量检索词。
export function extractSearchTerms(question: string): string[] {
  const terms: string[] = [];
  const lowerQuestion = question.toLowerCase();
  const words = lowerQuestion
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((word) => word.trim())
    .filter((word) => /^[a-z0-9_+#.-]+$/i.test(word))
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));

  words.forEach((word) => pushUnique(terms, word));
  collectChineseNgrams(terms, lowerQuestion);

  return terms.slice(0, 32);
}

// 计算 chunk 与检索词的相关度得分，命中词越多、命中次数越多，分数越高。
function countOccurrences(text: string, term: string): number {
  if (!term) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;
  while (fromIndex < text.length) {
    const index = text.indexOf(term, fromIndex);
    if (index === -1) {
      break;
    }
    count += 1;
    fromIndex = index + term.length;
  }
  return count;
}

// 计算 chunk 与检索词的相关度得分。
function scoreChunk(chunk: DocumentChunk, terms: string[]): number {
  const text = chunk.text.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  terms.forEach((term) => {
    const normalizedTerm = term.toLowerCase().trim();
    const occurrences = countOccurrences(text, normalizedTerm);
    if (occurrences > 0) {
      matchedTerms += 1;
      // 首次命中给较高基础分；重复命中只小幅加分，避免长片段天然占优。
      score += 10 + Math.min(occurrences - 1, 5) * 2;
    }
  });

  if (matchedTerms > 1) {
    // 多个不同检索词同时命中，说明片段更可能和问题整体相关。
    score += matchedTerms * 5;
  }

  return score;
}

// 根据检索词给每个文本 chunk 打分，按分数挑选 topK 片段，并用 maxChars 控制注入 prompt 的总长度。
export function retrieveRelevantChunks(
  chunks: DocumentChunk[],
  options: RetrievalOptions,
): ScoredDocumentChunk[] {
  const terms = Array.from(
    new Set(
      [...options.searchTerms, ...extractSearchTerms(options.question)]
        .map((term) => term.toLowerCase().trim()),
    ),
  ).filter(Boolean);
  // 只把高分片段放进 prompt；低分片段宁可丢弃，也不要重新撑爆上下文。
  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);

  const selected: ScoredDocumentChunk[] = [];
  let usedChars = 0;

  for (const item of scored) {
    if (selected.length >= options.topK) {
      break;
    }
    if (usedChars + item.chunk.text.length > options.maxChars) {
      continue;
    }
    selected.push(item);
    usedChars += item.chunk.text.length;
  }

  return selected;
}

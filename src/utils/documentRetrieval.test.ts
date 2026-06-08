/**
 * 测试文件：documentRetrieval.test.ts
 * 目标：验证本地关键词召回能按命中度选出相关 chunk。
 * 覆盖思路：用可控片段构造命中、未命中、多词命中和中文误召回场景。
 */

import { describe, expect, it } from "vitest";
import type { DocumentChunk } from "./textChunking";
import { retrieveRelevantChunks } from "./documentRetrieval";

function chunk(index: number, text: string): DocumentChunk {
  return {
    id: `file-1-chunk-${index}`,
    fileId: "file-1",
    fileName: "contract.txt",
    index,
    text,
    startOffset: index * 100,
    endOffset: index * 100 + text.length,
  };
}

describe("retrieveRelevantChunks", () => {
  it("ranks chunks by search term relevance", () => {
    const chunks = [
      chunk(0, "Delivery deadline is 10 days after signing."),
      chunk(1, "Payment deadline is 30 days after invoice approval."),
      chunk(2, "The project team meets every Friday."),
    ];

    const result = retrieveRelevantChunks(chunks, {
      question: "What is the payment deadline?",
      searchTerms: ["payment", "deadline"],
      topK: 2,
      maxChars: 200,
    });

    expect(result.map((item) => item.chunk.index)).toEqual([1, 0]);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("keeps returned chunks within the character budget", () => {
    const chunks = [
      chunk(0, "payment ".repeat(100)),
      chunk(1, "deadline ".repeat(100)),
      chunk(2, "invoice ".repeat(100)),
    ];

    const result = retrieveRelevantChunks(chunks, {
      question: "payment deadline invoice",
      searchTerms: ["payment", "deadline", "invoice"],
      topK: 3,
      maxChars: 850,
    });

    const totalChars = result.reduce((sum, item) => sum + item.chunk.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(850);
    expect(result).toHaveLength(1);
  });

  it("finds Chinese and mixed CSS terms from the question itself", () => {
    const chunks = [
      chunk(0, "Vue2 和 Vue3 的区别、响应式原理和生命周期。"),
      chunk(
        1,
        "CSS 继承机制：font-size、color 等属性会从父元素继承，布局类属性通常不会继承。",
      ),
      chunk(2, "Tailwind CSS 是 utility-first 的样式框架。"),
    ];

    const result = retrieveRelevantChunks(chunks, {
      question: "里面说的 CSS 属性继承有什么可以扩展的吗",
      searchTerms: [],
      topK: 2,
      maxChars: 300,
    });

    expect(result[0].chunk.index).toBe(1);
  });

  it("does not split provided search terms again and match broad partial words", () => {
    const chunks = [
      chunk(0, "浏览器缓存策略会影响静态资源加载。"),
      chunk(1, "HTTP 状态码用于描述响应结果。"),
    ];

    const result = retrieveRelevantChunks(chunks, {
      question: "",
      searchTerms: ["协商缓存机制"],
      topK: 2,
      maxChars: 200,
    });

    expect(result).toEqual([]);
  });
});

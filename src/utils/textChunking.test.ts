/**
 * 测试文件：textChunking.test.ts
 * 目标：验证长文本分块能兼顾 chunk 大小、自然边界和 overlap。
 * 覆盖思路：覆盖短文本、长文本、多段落和边界配置，避免切块后丢上下文。
 */

import { describe, expect, it } from "vitest";
import { splitTextIntoChunks } from "./textChunking";

describe("splitTextIntoChunks", () => {
  it("returns one chunk for text within the chunk size", () => {
    const chunks = splitTextIntoChunks("hello world", {
      fileId: "file-1",
      fileName: "notes.txt",
      chunkSize: 100,
      overlap: 10,
    });

    expect(chunks).toEqual([
      {
        id: "file-1-chunk-0",
        fileId: "file-1",
        fileName: "notes.txt",
        index: 0,
        text: "hello world",
        startOffset: 0,
        endOffset: 11,
      },
    ]);
  });

  it("splits long text into ordered overlapping chunks without dropping content", () => {
    const text = "alpha paragraph.\n\nbeta paragraph.\n\ngamma paragraph.";

    const chunks = splitTextIntoChunks(text, {
      fileId: "file-1",
      fileName: "notes.txt",
      chunkSize: 24,
      overlap: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2]);
    expect(chunks[0].text).toContain("alpha");
    expect(chunks[1].text).toContain("beta");
    expect(chunks[2].text).toContain("gamma");
    expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);
    expect(chunks[2].startOffset).toBeLessThan(chunks[1].endOffset);
  });
});

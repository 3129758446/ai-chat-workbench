/**
 * 文件功能：把上传的长文本切成可检索的稳定片段。
 * 实现思路：
 * 1. 优先在段落、换行、句子边界切分，尽量保留自然语义结构。
 * 2. 每个 chunk 记录文件 ID、文件名、序号和原文偏移，便于后续定位来源。
 * 3. 通过 overlap 让相邻片段共享一段尾部上下文，降低答案刚好落在切分边界时被拆散的概率。
 */

// 文档片段
export interface DocumentChunk {
  id: string; // chunk ID
  fileId: string; // 文件 ID
  fileName: string; // 文件名
  index: number; // chunk 序号
  text: string; // chunk 文本
  startOffset: number; // chunk 起始位置
  endOffset: number; // chunk 结束位置
}

export interface SplitTextOptions {
  fileId: string;
  fileName: string;
  chunkSize: number;
  overlap: number;
}

function findChunkEnd(text: string, start: number, maxEnd: number): number {
  if (maxEnd >= text.length) {
    return text.length;
  }

  const paragraphBreak = text.lastIndexOf("\n\n", maxEnd);
  if (paragraphBreak > start) {
    return paragraphBreak + 2;
  }

  const lineBreak = text.lastIndexOf("\n", maxEnd);
  if (lineBreak > start) {
    return lineBreak + 1;
  }
  
  // 尽量在句子边界切分，避免切分后上下文不连贯；如果句子过长则直接按长度切分。
  const sentenceBreaks = [".", "!", "?", ";", "。", "！", "？", "；"];
  let sentenceEnd = -1;
  sentenceBreaks.forEach((mark) => {
    sentenceEnd = Math.max(sentenceEnd, text.lastIndexOf(mark, maxEnd));
  });

  return sentenceEnd > start ? sentenceEnd + 1 : maxEnd;
}

// 把长文本切分为多个片段，每个片段包含文件 ID、文件名、序号和原文偏移等信息。
export function splitTextIntoChunks(
  text: string,
  options: SplitTextOptions,
): DocumentChunk[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const chunkSize = Math.max(1, options.chunkSize);
  const overlap = Math.max(0, Math.min(options.overlap, chunkSize - 1));
  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const maxEnd = Math.min(start + chunkSize, normalizedText.length);
    const end = findChunkEnd(normalizedText, start, maxEnd);
    const chunkText = normalizedText.slice(start, end).trim();

    if (chunkText) {
      chunks.push({
        id: `${options.fileId}-chunk-${chunks.length}`,
        fileId: options.fileId,
        fileName: options.fileName,
        index: chunks.length,
        text: chunkText,
        startOffset: start,
        endOffset: end,
      });
    }

    if (end >= normalizedText.length) {
      break;
    }

    // overlap 让相邻片段共享尾部上下文，避免答案刚好落在切分边界时被拆散。
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

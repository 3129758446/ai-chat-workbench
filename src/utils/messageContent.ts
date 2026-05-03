/**
 * 文件功能：构建发送给模型的用户消息内容，统一处理纯文本与图片多模态消息。
 * 设计思路：
 * 1. 将“文件转 data URL”和“消息片段组装”从页面层抽离，避免 App/hook 承担底层编码细节。
 * 2. 始终按上传顺序编码图片，保证模型接收顺序与用户操作顺序一致。
 * 3. 通过兜底文本确保 message content 非空，避免仅上传图片且无文本时出现空内容请求。
 */

import type { MessagePart, UploadingImage } from "../types/chat";

function fileToDataUrl(file: File): Promise<string> {
  // 将上传文件转为 data URL，便于直接以内联方式提交到多模态接口。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(`读取图片失败：${file.name || "unknown"}`));
    reader.readAsDataURL(file);
  });
}

export async function buildUserMessageContent(
  text: string,
  images: UploadingImage[],
): Promise<string | MessagePart[]> {
  // 无图片时直接返回文本，保持请求结构最简单。
  if (!images.length) {
    return text;
  }

  // 有图片时切换为多段内容，兼容 text + image_url 的组合输入格式。
  const parts: MessagePart[] = [];
  if (text) {
    // 用户输入文本始终放在图片前，便于模型先理解任务再看视觉输入。
    parts.push({ type: "text", text });
  }

  for (const item of images) {
    // 顺序读取图片，保证内容顺序与用户上传顺序一致。
    const dataUrl = await fileToDataUrl(item.file);
    parts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  if (!parts.length) {
    // 兜底：确保 content 永不为空数组。
    parts.push({ type: "text", text: "请描述这张图片。" });
  }

  return parts;
}

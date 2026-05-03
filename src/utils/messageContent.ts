import type { MessagePart, UploadingImage } from "../types/chat";

function fileToDataUrl(file: File): Promise<string> {
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
  if (!images.length) {
    return text;
  }

  const parts: MessagePart[] = [];
  if (text) {
    parts.push({ type: "text", text });
  }

  for (const item of images) {
    const dataUrl = await fileToDataUrl(item.file);
    parts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  if (!parts.length) {
    parts.push({ type: "text", text: "请描述这张图片。" });
  }

  return parts;
}

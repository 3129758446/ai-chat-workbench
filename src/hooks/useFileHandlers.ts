import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useChatStore } from "../store";
import {
  isImageFile,
  MAX_TEXT_FILE_COUNT,
  validateTextFile,
  createUploadingTextFile,
  parseTextFile,
} from "../utils/fileUpload";
import { uid } from "../utils/helpers";
import type { UploadingImage, UploadingTextFile } from "../types/chat";

/**
 * Hook 功能：文件上传与解析处理器
 * 设计思路：
 * 1. 统一管理图片与文本文件的分流逻辑。
 * 2. 封装异步解析流程，将解析结果实时更新回 Store。
 * 3. 首页自动创建会话：如果在首页上传，先创建一个新会话再绑定文件。
 */
export function useFileHandlers(
  mode: "home" | "chat",
  routeConversationId: string | null,
  navigate: NavigateFunction,
  homeInput: string,
  setHomeInput: Dispatch<SetStateAction<string>>,
) {
  // 从 ChatStore 中获取必要的函数
  const {
    createConversation,
    addUploadingImages,
    addUploadingFiles,
    updateUploadingFile,
  } = useChatStore();

  // 处理文件上传事件：图片与文本文件分别处理。
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    // 1. 文件分类 
    const imageFiles = files.filter(isImageFile); // 过滤出图片文件
    const textFiles = files.filter((file) => !isImageFile(file)); // 过滤出文本文件

    // 2. 确定目标会话 ID (首页则即时创建)
    const targetConversationId =
      mode === "chat" && routeConversationId
        ? routeConversationId
        : createConversation();

    // 3. 处理图片：生成预览 URL
    const nextImages: UploadingImage[] = imageFiles.map((file) => ({
      id: uid("img"),
      file,
      url: URL.createObjectURL(file),
    }));

    // 4. 处理文本文件：校验数量与格式
    const existingFiles =
      useChatStore.getState().conversations[targetConversationId]
        ?.uploadingFiles || [];
    const activeFileCount = existingFiles.filter(
      (file) => file.status !== "error",  // 忽略错误状态的文件
    ).length;
    let acceptedCount = 0;

    const nextTextFiles: UploadingTextFile[] = textFiles.map((file) => {
      if (activeFileCount + acceptedCount >= MAX_TEXT_FILE_COUNT) { // 检查是否超过最大数量
        return createUploadingTextFile(
          file,
          "error",
          `单个会话最多上传 ${MAX_TEXT_FILE_COUNT} 个文本文件。`,
        );
      }

      const error = validateTextFile(file);
      if (error) {
        return createUploadingTextFile(file, "error", error);
      }

      acceptedCount++;
      return createUploadingTextFile(file);
    });

    // 5. 同步更新 Store
    if (nextImages.length) {
      addUploadingImages(targetConversationId, nextImages);
    }
    if (nextTextFiles.length) {
      addUploadingFiles(targetConversationId, nextTextFiles);
    }

    // 6. 异步解析文本内容
    nextTextFiles
      .filter((f) => f.status === "parsing") // 过滤出待解析状态的文件
      .forEach((file) => {
        // 文本解析是异步的，因此先把文件放进列表，再逐个回填 ready/error 状态。
        void parseTextFile(file.file)
          .then((text) => {
            updateUploadingFile(targetConversationId, file.id, {
              status: "ready",
              text,
            });
          })
          .catch((err) => {
            updateUploadingFile(targetConversationId, file.id, {
              status: "error",
              error:
                err instanceof Error ? err.message : "文件读取失败，请重试。",
            });
          });
      });

    // 7. 聊天页只清空 file input；首页则跳转到新建会话并保留草稿文本。
    if (mode === "chat" && routeConversationId) {
      event.target.value = "";
      return;
    }

    // 首页上传文件时先完成“建会话 + 挂草稿 + 跳聊天页”，避免文件脱离会话上下文。
    navigate(`/chat/${targetConversationId}`, {
      state: {
        draftPrompt: homeInput,
        shouldAutoSend: false,
      },
    });
    setHomeInput("");
    event.target.value = "";
  };

  return { handleFileChange };
}

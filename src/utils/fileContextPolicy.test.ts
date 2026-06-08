/**
 * 测试文件：fileContextPolicy.test.ts
 * 目标：验证普通问题、辅助使用文件、严格基于文件三类意图能被正确区分。
 * 覆盖思路：用接近真实聊天的中文表达，防止后续问题被上传文件过度绑定。
 */

import { describe, expect, it } from "vitest";
import { resolveFileContextPolicy } from "./fileContextPolicy";

describe("resolveFileContextPolicy", () => {
  it("does not use file context for ordinary concept questions", () => {
    expect(resolveFileContextPolicy("Last-Modified")).toBe("none");
    expect(resolveFileContextPolicy("CSS 继承是什么")).toBe("none");
  });

  it("uses assist mode when the user asks to combine uploaded materials", () => {
    expect(resolveFileContextPolicy("结合我上传的资料讲讲 Last-Modified")).toBe(
      "assist",
    );
    expect(resolveFileContextPolicy("里面说的 CSS 属性继承还能怎么扩展")).toBe(
      "assist",
    );
  });

  it("uses strict mode when the user explicitly asks what the file contains", () => {
    expect(resolveFileContextPolicy("文件里有没有讲 Last-Modified")).toBe(
      "strict",
    );
    expect(resolveFileContextPolicy("只根据这个 md 回答")).toBe("strict");
  });
});

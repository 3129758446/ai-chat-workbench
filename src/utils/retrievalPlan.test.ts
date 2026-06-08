/**
 * 测试文件：retrievalPlan.test.ts
 * 目标：验证 AI 辅助检索计划的 prompt 构建、JSON 解析和 fallback 行为。
 * 覆盖思路：模型输出可能带说明文字或非法 JSON，解析失败时必须安全回退。
 */

import { describe, expect, it } from "vitest";
import {
  buildRetrievalPlanPrompt,
  createFallbackRetrievalPlan,
  parseRetrievalPlanResponse,
} from "./retrievalPlan";

describe("retrievalPlan", () => {
  it("parses a JSON retrieval plan from model output", () => {
    const plan = parseRetrievalPlanResponse(`
      Here is the plan:
      {
        "searchTerms": ["invoice approval", "settlement"]
      }
    `);

    expect(plan).toEqual({
      searchTerms: ["invoice approval", "settlement"],
    });
  });

  it("falls back to local terms when the model output is invalid", () => {
    const plan = createFallbackRetrievalPlan("What is the payment deadline?");

    expect(plan.searchTerms).toEqual(["payment", "deadline"]);
  });

  it("builds a prompt that asks the model for JSON only", () => {
    const prompt = buildRetrievalPlanPrompt({
      question: "What risks are in this contract?",
      files: [{ name: "contract.txt", summary: "payment and delivery terms" }],
    });

    expect(prompt).toContain("只返回 JSON");
    expect(prompt).toContain("contract.txt");
    expect(prompt).toContain("payment and delivery terms");
    expect(prompt).toContain('{"searchTerms":["检索词"]}');
  });
});

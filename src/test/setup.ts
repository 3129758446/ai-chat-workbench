import "@testing-library/jest-dom";
import { vi } from "vitest";

// 模拟 window.scrollTo，因为 jsdom 不支持
window.scrollTo = vi.fn();

// 模拟 requestAnimationFrame
window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
  return window.setTimeout(() => cb(Date.now()), 0);
});

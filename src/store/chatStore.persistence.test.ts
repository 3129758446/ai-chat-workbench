import { describe, expect, it, vi } from "vitest";
import { createDatabaseOnlyStorage } from "./chatStore.persistence";

describe("chatStore persistence storage", () => {
  it("does not write chat state to browser localStorage", () => {
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }),
    } as unknown as Storage;

    const databaseOnlyStorage = createDatabaseOnlyStorage(storage);

    expect(databaseOnlyStorage.getItem("LINGXI_CHAT_STORE")).toBeNull();
    expect(() =>
      databaseOnlyStorage.setItem("LINGXI_CHAT_STORE", "{}"),
    ).not.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith("LINGXI_CHAT_STORE");
  });
});

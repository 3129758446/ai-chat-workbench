import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRemoteChatState,
  saveRemoteChatState,
} from "./remoteChatPersistence";
import type { PersistedChatState } from "../store";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("remote chat persistence", () => {
  it("loads state from the backend response", async () => {
    const state: PersistedChatState = {
      theme: "light",
      modelProvider: "auto",
      currentConversationId: null,
      orderedConversationIds: [],
      conversations: {},
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state }),
    });

    await expect(loadRemoteChatState()).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith("/local-api/chat-state");
  });

  it("saves state to the backend", async () => {
    const state: PersistedChatState = {
      theme: "dark",
      modelProvider: "deepseek",
      currentConversationId: null,
      orderedConversationIds: [],
      conversations: {},
    };

    fetchMock.mockResolvedValueOnce({ ok: true });

    await saveRemoteChatState(state);

    expect(fetchMock).toHaveBeenCalledWith("/local-api/chat-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  });
});

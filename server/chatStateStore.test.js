import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createChatStateStore } from "./chatStateStore.js";

test("chat state store returns null before saving and restores saved state", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "chat-state-"));
  const dbPath = join(tempDir, "test.db");

  try {
    const store = createChatStateStore(dbPath);
    assert.equal(store.getState(), null);

    const state = {
      theme: "light",
      modelProvider: "auto",
      currentConversationId: "conversation-1",
      orderedConversationIds: ["conversation-1"],
      conversations: {
        "conversation-1": {
          id: "conversation-1",
          title: "New Conversation",
          createdAt: 1,
          updatedAt: 2,
          lastMessagePreview: "hello",
          draftInput: "",
          messages: [{ id: "user-1", role: "user", text: "hello" }],
          chatHistory: [{ role: "user", content: "hello" }],
        },
      },
    };

    store.saveState(state);

    assert.deepEqual(store.getState(), state);
    store.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

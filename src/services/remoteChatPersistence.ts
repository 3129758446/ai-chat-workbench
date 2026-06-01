import type { PersistedChatState } from "../store";

const CHAT_STATE_ENDPOINT = "/local-api/chat-state";

export async function loadRemoteChatState(): Promise<PersistedChatState | null> {
  const response = await fetch(CHAT_STATE_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Failed to load remote chat state: ${response.status}`);
  }

  const payload = (await response.json()) as {
    state?: PersistedChatState | null;
  };

  return payload.state || null;
}

export async function saveRemoteChatState(
  state: PersistedChatState,
): Promise<void> {
  const response = await fetch(CHAT_STATE_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });

  if (!response.ok) {
    throw new Error(`Failed to save remote chat state: ${response.status}`);
  }
}

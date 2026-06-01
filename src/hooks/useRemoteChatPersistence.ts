import { useEffect, useRef } from "react";
import {
  loadRemoteChatState,
  saveRemoteChatState,
} from "../services/remoteChatPersistence";
import { useChatStore } from "../store";
import {
  mergePersistedChatState,
  partializeChatState,
} from "../store/chatStore.persistence";

const SAVE_DEBOUNCE_MS = 800;

export function useRemoteChatPersistence() {
  const readyToSaveRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const remoteState = await loadRemoteChatState();
        if (disposed) {
          return;
        }

        if (remoteState) {
          useChatStore.setState((current) =>
            mergePersistedChatState(remoteState, current),
          );
        }
      } catch (error) {
        console.warn("Remote chat persistence is unavailable.", error);
      } finally {
        if (!disposed) {
          readyToSaveRef.current = true;
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let timerId: number | null = null;

    const unsubscribe = useChatStore.subscribe((state) => {
      if (!readyToSaveRef.current) {
        return;
      }

      const snapshot = partializeChatState(state);
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }

      timerId = window.setTimeout(() => {
        void saveRemoteChatState(snapshot).catch((error) => {
          console.warn("Failed to save remote chat state.", error);
        });
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, []);
}

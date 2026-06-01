import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function createChatStateStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const getStatement = db.prepare("SELECT state FROM chat_state WHERE id = 1");
  const saveStatement = db.prepare(`
    INSERT INTO chat_state (id, state, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      updated_at = excluded.updated_at
  `);

  return {
    getState() {
      const row = getStatement.get();
      if (!row) {
        return null;
      }

      return JSON.parse(row.state);
    },
    saveState(state) {
      saveStatement.run(JSON.stringify(state), Date.now());
    },
    close() {
      db.close();
    },
  };
}

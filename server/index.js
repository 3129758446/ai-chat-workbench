import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createChatStateStore } from "./chatStateStore.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.CHAT_SERVER_PORT || 8787);
const dbPath =
  process.env.CHAT_DB_PATH || join(__dirname, "data", "chat-state.db");

const app = express();
const store = createChatStateStore(dbPath);

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/chat-state", (_req, res) => {
  res.json({ state: store.getState() });
});

app.put("/chat-state", (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Request body must be a JSON object." });
    return;
  }

  store.saveState(req.body);
  res.status(204).end();
});

const server = app.listen(port, () => {
  console.log(`Chat persistence server listening on http://localhost:${port}`);
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

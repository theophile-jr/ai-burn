// Cursor (the IDE) keeps chat bubbles in a SQLite key/value store:
//   ~/.config/Cursor/User/globalStorage/state.vscdb  (table cursorDiskKV)
// Assistant bubbles ("bubbleId:<composerId>:<bubbleId>") carry exact
// { tokenCount: { inputTokens, outputTokens } } but no per-bubble model or
// timestamp, so we borrow the conversation's createdAt from its
// "composerData:<composerId>" row and bill at the mid energy/price tier.
import { homedir } from "node:os";
import { join } from "node:path";
import { querySqlite } from "./sqlite.js";

export const id = "cursor";
export const name = "Cursor";
export const emoji = "🖱️";
export const estimated = true; // exact tokens, unknown model → tier guess

export function defaultDb(platform = process.platform) {
  const base =
    platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "Cursor")
      : platform === "win32"
        ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cursor")
        : join(homedir(), ".config", "Cursor");
  return join(base, "User", "globalStorage", "state.vscdb");
}

export async function collect(opts = {}) {
  const db = opts.paths?.cursorDb ?? defaultDb();

  const composers = await querySqlite(
    db,
    `SELECT key, json_extract(value, '$.createdAt') AS createdAt
       FROM cursorDiskKV
      WHERE key LIKE 'composerData:%' AND json_valid(value)`
  );
  if (composers === null) return []; // no sqlite3 CLI or no Cursor db

  const createdAt = new Map();
  for (const c of composers) {
    createdAt.set(c.key.slice("composerData:".length), c.createdAt);
  }

  const bubbles = await querySqlite(
    db,
    `SELECT key,
            json_extract(value, '$.tokenCount.inputTokens')  AS input,
            json_extract(value, '$.tokenCount.outputTokens') AS output,
            json_extract(value, '$.modelType.modelName')     AS model
       FROM cursorDiskKV
      WHERE key LIKE 'bubbleId:%' AND json_valid(value)
        AND json_extract(value, '$.tokenCount.inputTokens') IS NOT NULL`
  );
  if (bubbles === null) return [];

  const turns = [];
  for (const b of bubbles) {
    const input = b.input ?? 0;
    const output = b.output ?? 0;
    if (input + output === 0) continue;
    const composerId = b.key.split(":")[1];
    const ts = createdAt.get(composerId);
    turns.push({
      ts: Number.isFinite(ts) ? ts : null,
      model: b.model || "cursor/unknown-model",
      tokens: { input, output, cacheRead: 0, cacheWrite: 0 },
    });
  }
  return turns;
}

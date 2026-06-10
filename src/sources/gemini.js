// Gemini CLI saves chats as JSON under ~/.gemini/tmp/<project>/chats/.
// Model messages carry exact token usage:
//   { type: "gemini", model, timestamp,
//     tokens: { input, output, cached, thoughts, tool, total } }
// `input` includes `cached` (Gemini's promptTokenCount semantics) and
// `thoughts` bills as output, so we unbundle accordingly. Saved checkpoints
// can duplicate messages across files — dedupe on message id.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const id = "gemini";
export const name = "Gemini CLI";
export const emoji = "♊";

export function defaultDir() {
  return join(homedir(), ".gemini", "tmp");
}

export async function collect(opts = {}) {
  const root = opts.paths?.geminiDir ?? defaultDir();
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const turns = [];
  const seen = new Set();
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const chatsDir = join(root, p.name, "chats");
    let files;
    try {
      files = await readdir(chatsDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      let session;
      try {
        session = JSON.parse(await readFile(join(chatsDir, f), "utf8"));
      } catch {
        continue;
      }
      for (const msg of session?.messages ?? []) {
        if (msg?.type !== "gemini" || !msg.tokens) continue;
        if (msg.id) {
          if (seen.has(msg.id)) continue;
          seen.add(msg.id);
        }
        const t = msg.tokens;
        const cached = t.cached ?? 0;
        const ts = Date.parse(msg.timestamp ?? "");
        turns.push({
          ts: Number.isFinite(ts) ? ts : null,
          model: msg.model || "gemini",
          tokens: {
            input: Math.max(0, (t.input ?? 0) - cached) + (t.tool ?? 0),
            output: (t.output ?? 0) + (t.thoughts ?? 0),
            cacheRead: cached,
            cacheWrite: 0,
          },
        });
      }
    }
  }
  return turns;
}

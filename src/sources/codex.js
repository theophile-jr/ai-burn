// OpenAI Codex CLI writes one rollout JSONL per session under
// ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Each API response emits
//   { type: "event_msg", payload: { type: "token_count",
//       info: { last_token_usage: { input_tokens, cached_input_tokens,
//                                    output_tokens, ... } } } }
// where input_tokens INCLUDES cached_input_tokens. The active model comes
// from the most recent turn_context event in the same file.
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

export const id = "codex";
export const name = "Codex CLI";
export const emoji = "🌀";

export function defaultDir() {
  return join(homedir(), ".codex", "sessions");
}

async function listJsonl(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await listJsonl(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
}

export async function collect(opts = {}) {
  const root = opts.paths?.codexDir ?? defaultDir();
  const files = [];
  await listJsonl(root, files);
  const turns = [];
  for (const file of files) {
    try {
      await scanFile(file, turns);
    } catch {
      continue;
    }
  }
  return turns;
}

async function scanFile(file, turns) {
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let model = "gpt-5";
  for await (const line of rl) {
    if (!line.includes('"turn_context"') && !line.includes('"token_count"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "turn_context" && entry.payload?.model) {
      model = entry.payload.model;
      continue;
    }
    if (entry.type !== "event_msg" || entry.payload?.type !== "token_count") continue;
    const u = entry.payload.info?.last_token_usage;
    if (!u) continue;
    const cached = u.cached_input_tokens ?? 0;
    const ts = Date.parse(entry.timestamp ?? "");
    turns.push({
      ts: Number.isFinite(ts) ? ts : null,
      model,
      tokens: {
        input: Math.max(0, (u.input_tokens ?? 0) - cached),
        output: u.output_tokens ?? 0,
        cacheRead: cached,
        cacheWrite: 0,
      },
    });
  }
}

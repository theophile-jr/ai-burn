// Claude Code stores one JSONL transcript per session under
// <config dir>/projects/<project>/<session>.jsonl. Assistant turns carry
// exact API usage. Resumed/forked sessions duplicate turns, so we dedupe on
// requestId + message id.
import { createReadStream } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

export const id = "claude";
export const name = "Claude Code";
export const emoji = "✳️";

export function defaultRoots(env = process.env) {
  const roots = [];
  if (env.CLAUDE_CONFIG_DIR) roots.push(join(env.CLAUDE_CONFIG_DIR, "projects"));
  roots.push(join(homedir(), ".claude", "projects"));
  roots.push(join(homedir(), ".config", "claude", "projects"));
  return roots;
}

async function listJsonlFiles(roots) {
  const files = [];
  const seenDirs = new Set();
  for (const root of roots) {
    let real;
    try {
      real = await realpath(root);
    } catch {
      continue; // root doesn't exist
    }
    if (seenDirs.has(real)) continue;
    seenDirs.add(real);
    let projects;
    try {
      projects = await readdir(real, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const dir = join(real, p.name);
      let entries;
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const f of entries) {
        if (f.endsWith(".jsonl")) files.push(join(dir, f));
      }
    }
  }
  return files;
}

/** @returns {Promise<import("./types.js").Turn[]>} */
export async function collect(opts = {}) {
  const roots = opts.paths?.claudeRoots ?? defaultRoots();
  const files = await listJsonlFiles(roots);
  const turns = [];
  const seen = new Set(); // requestId:messageId — dedupe resumed/forked sessions

  for (const file of files) {
    // A file disappearing mid-scan (session cleanup) shouldn't kill the run.
    try {
      await scanFile(file, turns, seen);
    } catch {
      continue;
    }
  }
  return turns;
}

async function scanFile(file, turns, seen) {
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue; // cheap pre-filter
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry?.message;
    const usage = msg?.usage;
    if (!usage || typeof usage !== "object") continue;
    const model = msg.model;
    if (!model || model === "<synthetic>") continue;

    if (entry.requestId && msg.id) {
      const key = `${entry.requestId}:${msg.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const ts = Date.parse(entry.timestamp ?? "");
    turns.push({
      ts: Number.isFinite(ts) ? ts : null,
      model,
      tokens: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
    });
  }
}

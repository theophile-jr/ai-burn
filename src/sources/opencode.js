// OpenCode stores everything in ~/.local/share/opencode/opencode.db.
// Assistant messages carry exact usage and the cost OpenCode itself computed:
//   message.data = { role, modelID, providerID, time: { created },
//                    tokens: { input, output, reasoning,
//                              cache: { read, write } }, cost }
// We trust their cost figure when it's non-zero (it knows the real provider
// rates), otherwise fall back to our own table.
import { homedir } from "node:os";
import { join } from "node:path";
import { querySqlite } from "./sqlite.js";

export const id = "opencode";
export const name = "OpenCode";
export const emoji = "🔓";

export function defaultDb() {
  const base =
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(base, "opencode", "opencode.db");
}

export async function collect(opts = {}) {
  const db = opts.paths?.opencodeDb ?? defaultDb();
  const rows = await querySqlite(
    db,
    `SELECT json_extract(data, '$.modelID')             AS model,
            json_extract(data, '$.time.created')        AS ts,
            json_extract(data, '$.tokens.input')        AS input,
            json_extract(data, '$.tokens.output')       AS output,
            json_extract(data, '$.tokens.reasoning')    AS reasoning,
            json_extract(data, '$.tokens.cache.read')   AS cacheRead,
            json_extract(data, '$.tokens.cache.write')  AS cacheWrite,
            json_extract(data, '$.cost')                AS cost
       FROM message
      WHERE json_extract(data, '$.role') = 'assistant'
        AND json_extract(data, '$.tokens') IS NOT NULL`
  );
  if (rows === null) return [];

  const turns = [];
  for (const r of rows) {
    const tokens = {
      input: r.input ?? 0,
      output: (r.output ?? 0) + (r.reasoning ?? 0),
      cacheRead: r.cacheRead ?? 0,
      cacheWrite: r.cacheWrite ?? 0,
    };
    if (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite === 0) continue;
    turns.push({
      ts: Number.isFinite(r.ts) ? r.ts : null,
      model: r.model || "opencode/unknown-model",
      tokens,
      usd: r.cost > 0 ? r.cost : undefined,
    });
  }
  return turns;
}

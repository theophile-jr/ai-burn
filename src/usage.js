import * as claude from "./sources/claude.js";
import * as gemini from "./sources/gemini.js";
import * as codex from "./sources/codex.js";
import * as cursor from "./sources/cursor.js";
import * as opencode from "./sources/opencode.js";
import { tierOf, energyWh, co2Kg, waterL } from "./co2.js";
import { costUsd } from "./pricing.js";

export { defaultRoots } from "./sources/claude.js";

/** Every AI tool we know how to read usage from. */
export const SOURCES = [claude, gemini, codex, cursor, opencode];

export const SOURCE_IDS = SOURCES.map((s) => s.id);

function emptyAgg() {
  return {
    kg: 0,
    wh: 0,
    waterL: 0,
    usd: 0,
    entries: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    byModel: new Map(), // model -> { kg, usd, tokens }
    byTool: new Map(), // tool id -> { name, emoji, kg, usd, tokens, entries, estimated }
    byDay: new Map(), // YYYY-MM-DD (local) -> kg
    firstTs: null,
    lastTs: null,
  };
}

function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Scan every supported AI tool's local history and aggregate emissions,
 * water and retail cost.
 * @param {{days?: number, now?: number, tools?: string[],
 *          roots?: string[], paths?: object}} opts
 *   days  — only count turns from the last N days.
 *   tools — restrict to these source ids (default: all).
 *   roots — shorthand for paths.claudeRoots (back-compat).
 *   paths — per-source location overrides (mostly for tests).
 */
export async function collectUsage(opts = {}) {
  const now = opts.now ?? Date.now();
  const cutoff = Number.isFinite(opts.days) ? now - opts.days * 86_400_000 : -Infinity;
  const paths = { ...(opts.paths ?? {}) };
  if (opts.roots) paths.claudeRoots = opts.roots;

  const wanted = opts.tools ?? SOURCE_IDS;
  const sources = SOURCES.filter((s) => wanted.includes(s.id));

  const agg = emptyAgg();
  const results = await Promise.all(
    sources.map(async (s) => {
      // One broken tool's history shouldn't take down the whole report.
      try {
        return await s.collect({ paths });
      } catch {
        return [];
      }
    })
  );

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    for (const turn of results[i]) {
      if (turn.ts !== null && turn.ts < cutoff) continue;
      addTurn(agg, source, turn);
    }
  }

  agg.tokens.total =
    agg.tokens.input + agg.tokens.output + agg.tokens.cacheRead + agg.tokens.cacheWrite;
  agg.waterL = waterL(agg.wh);
  return agg;
}

function addTurn(agg, source, turn) {
  const { tokens, model, ts } = turn;
  const wh = energyWh(tokens, tierOf(model));
  const kg = co2Kg(wh);
  const usd = turn.usd ?? costUsd(tokens, model);
  const totalTokens =
    tokens.input + tokens.output + tokens.cacheRead + (tokens.cacheWrite ?? 0);

  agg.entries++;
  agg.wh += wh;
  agg.kg += kg;
  agg.usd += usd;
  agg.tokens.input += tokens.input;
  agg.tokens.output += tokens.output;
  agg.tokens.cacheRead += tokens.cacheRead;
  agg.tokens.cacheWrite += tokens.cacheWrite ?? 0;

  const m = agg.byModel.get(model) ?? { kg: 0, usd: 0, tokens: 0 };
  m.kg += kg;
  m.usd += usd;
  m.tokens += totalTokens;
  agg.byModel.set(model, m);

  const t =
    agg.byTool.get(source.id) ??
    {
      name: source.name,
      emoji: source.emoji,
      kg: 0,
      usd: 0,
      tokens: 0,
      entries: 0,
      estimated: source.estimated ?? false,
    };
  t.kg += kg;
  t.usd += usd;
  t.tokens += totalTokens;
  t.entries++;
  agg.byTool.set(source.id, t);

  if (ts !== null) {
    if (agg.firstTs === null || ts < agg.firstTs) agg.firstTs = ts;
    if (agg.lastTs === null || ts > agg.lastTs) agg.lastTs = ts;
    const day = localDay(new Date(ts));
    agg.byDay.set(day, (agg.byDay.get(day) ?? 0) + kg);
  }
}

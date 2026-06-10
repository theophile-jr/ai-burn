import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectUsage } from "../src/usage.js";
import { energyWh, co2Kg, waterL } from "../src/co2.js";
import { costUsd } from "../src/pricing.js";
import { render, toJson } from "../src/render.js";
import { parseArgs } from "../src/cli.js";

function turn({ model = "claude-opus-4-8", reqId, msgId, ts, inp = 100, out = 50, cacheCreate = 0, cacheRead = 0 }) {
  return JSON.stringify({
    type: "assistant",
    requestId: reqId,
    timestamp: ts,
    message: {
      id: msgId,
      model,
      usage: {
        input_tokens: inp,
        output_tokens: out,
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
      },
    },
  });
}

async function withFixture(lines, fn) {
  const root = await mkdtemp(join(tmpdir(), "pollution-test-"));
  try {
    const proj = join(root, "-home-user-myproject");
    await mkdir(proj, { recursive: true });
    await writeFile(join(proj, "session.jsonl"), lines.join("\n") + "\n");
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const CLAUDE_ONLY = { tools: ["claude"] };

test("aggregates tokens and dedupes by requestId + message id", async () => {
  const lines = [
    turn({ reqId: "r1", msgId: "m1", ts: "2026-06-01T10:00:00Z", inp: 1000, out: 500 }),
    turn({ reqId: "r1", msgId: "m1", ts: "2026-06-01T10:00:00Z", inp: 1000, out: 500 }), // duplicate
    turn({ reqId: "r2", msgId: "m2", ts: "2026-06-02T10:00:00Z", inp: 200, out: 100, cacheCreate: 50, cacheRead: 400 }),
    '{"type":"user","message":{"role":"user"}}', // no usage
    "not json at all {{{", // malformed
    turn({ model: "<synthetic>", reqId: "r3", msgId: "m3", ts: "2026-06-02T11:00:00Z" }), // error placeholder
  ];
  await withFixture(lines, async (root) => {
    const agg = await collectUsage({ roots: [root], ...CLAUDE_ONLY });
    assert.equal(agg.entries, 2);
    assert.equal(agg.tokens.input, 1200);
    assert.equal(agg.tokens.output, 600);
    assert.equal(agg.tokens.cacheRead, 400);
    assert.equal(agg.tokens.cacheWrite, 50);
    assert.equal(agg.tokens.total, 1200 + 600 + 400 + 50);
    assert.equal(agg.byModel.size, 1);
    assert.equal(agg.byDay.size, 2);
    assert.equal(agg.byTool.get("claude").entries, 2);

    const t1 = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 };
    const t2 = { input: 200, output: 100, cacheRead: 400, cacheWrite: 50 };
    const expectedWh = energyWh(t1, "frontier") + energyWh(t2, "frontier");
    assert.ok(Math.abs(agg.wh - expectedWh) < 1e-12);
    assert.ok(Math.abs(agg.kg - co2Kg(expectedWh)) < 1e-12);
    assert.ok(Math.abs(agg.waterL - waterL(expectedWh)) < 1e-12);
    const expectedUsd =
      costUsd(t1, "claude-opus-4-8") + costUsd(t2, "claude-opus-4-8");
    assert.ok(Math.abs(agg.usd - expectedUsd) < 1e-12);
  });
});

test("--days window filters old turns", async () => {
  const now = Date.parse("2026-06-10T00:00:00Z");
  const lines = [
    turn({ reqId: "r1", msgId: "m1", ts: "2026-01-01T10:00:00Z" }),
    turn({ reqId: "r2", msgId: "m2", ts: "2026-06-09T10:00:00Z" }),
  ];
  await withFixture(lines, async (root) => {
    const agg = await collectUsage({ roots: [root], days: 7, now, ...CLAUDE_ONLY });
    assert.equal(agg.entries, 1);
  });
});

test("missing roots yield an empty, renderable result", async () => {
  const agg = await collectUsage({ roots: ["/nonexistent/nope"], ...CLAUDE_ONLY });
  assert.equal(agg.entries, 0);
  assert.equal(agg.kg, 0);
  const text = render(agg, { color: false });
  assert.match(text, /No AI tool history/);
});

test("render and toJson expose the same totals", async () => {
  const lines = [
    turn({ reqId: "r1", msgId: "m1", ts: "2026-06-01T10:00:00Z", inp: 5e6, out: 2e6 }),
  ];
  await withFixture(lines, async (root) => {
    const agg = await collectUsage({ roots: [root], ...CLAUDE_ONLY });
    const text = render(agg, { color: false });
    assert.match(text, /CO₂e/);
    assert.match(text, /of water/);
    assert.match(text, /at API prices/);
    assert.match(text, /Lake Geneva/);
    assert.match(text, /top model: claude-opus-4-8 \(100%\)/);
    const j = toJson(agg);
    assert.equal(j.co2_kg, agg.kg);
    assert.equal(j.water_l, agg.waterL);
    assert.equal(j.retail_cost_usd, agg.usd);
    assert.equal(j.api_turns, 1);
    assert.equal(j.by_tool.claude.api_turns, 1);
    assert.ok(j.rank.name.length > 0);
    assert.ok(j.lake_geneva_share > 0);
  });
});

test("single tool keeps the per-tool section out of the report", async () => {
  const lines = [turn({ reqId: "r1", msgId: "m1", ts: "2026-06-01T10:00:00Z" })];
  await withFixture(lines, async (root) => {
    const agg = await collectUsage({ roots: [root], ...CLAUDE_ONLY });
    const text = render(agg, { color: false });
    assert.doesNotMatch(text, /By tool/);
  });
});

test("parseArgs handles flags and rejects junk", () => {
  assert.equal(parseArgs([]).days, Infinity);
  assert.equal(parseArgs([]).tools, undefined);
  assert.equal(parseArgs(["--days", "30"]).days, 30);
  assert.equal(parseArgs(["--days=7"]).days, 7);
  assert.deepEqual(parseArgs(["--tools", "claude,gemini"]).tools, ["claude", "gemini"]);
  assert.deepEqual(parseArgs(["--tools=codex"]).tools, ["codex"]);
  assert.equal(parseArgs(["--json"]).json, true);
  assert.equal(parseArgs(["--no-color"]).color, false);
  assert.throws(() => parseArgs(["--days", "-1"]));
  assert.throws(() => parseArgs(["--tools", "clippy"]));
  assert.throws(() => parseArgs(["--tools="]));
  assert.throws(() => parseArgs(["--wat"]));
});

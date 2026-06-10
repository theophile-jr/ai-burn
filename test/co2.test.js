import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierOf,
  energyWh,
  co2Kg,
  waterL,
  rankFor,
  pickEquivalents,
  RANKS,
  PUE,
  KG_CO2_PER_KWH,
  WATER_L_PER_KWH,
  WH_PER_MTOK,
  EQUIVALENTS,
  WATER_EQUIVALENTS,
} from "../src/co2.js";

test("tierOf maps model ids across vendors to tiers", () => {
  assert.equal(tierOf("claude-opus-4-8"), "frontier");
  assert.equal(tierOf("claude-fable-5"), "frontier");
  assert.equal(tierOf("claude-sonnet-4-6"), "standard");
  assert.equal(tierOf("claude-haiku-4-5-20251001"), "light");
  assert.equal(tierOf("gpt-5.5"), "standard");
  assert.equal(tierOf("gpt-5-codex"), "standard");
  assert.equal(tierOf("gpt-5-mini"), "light");
  assert.equal(tierOf("gemini-3-flash-preview"), "light");
  assert.equal(tierOf("gemini-2.5-pro"), "standard");
  assert.equal(tierOf("kimi-k2.6"), "standard");
  assert.equal(tierOf("some-unknown-model"), "standard");
  assert.equal(tierOf(undefined), "standard");
});

test("energyWh: 1M frontier output tokens = the configured rate", () => {
  const wh = energyWh({ input: 0, output: 1_000_000, cacheRead: 0 }, "frontier");
  assert.equal(wh, WH_PER_MTOK.frontier.output);
});

test("energyWh mixes token kinds; cache writes bill as input", () => {
  const wh = energyWh(
    { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 },
    "light"
  );
  const r = WH_PER_MTOK.light;
  assert.equal(wh, 2 * r.input + r.output + r.cacheRead);
});

test("co2Kg and waterL apply PUE and intensity factors", () => {
  assert.equal(co2Kg(1000), PUE * KG_CO2_PER_KWH);
  assert.equal(waterL(1000), PUE * WATER_L_PER_KWH);
  assert.equal(co2Kg(0), 0);
});

test("ranks are sorted and start at zero", () => {
  assert.equal(RANKS[0].min, 0);
  for (let i = 1; i < RANKS.length; i++) {
    assert.ok(RANKS[i].min > RANKS[i - 1].min);
  }
});

test("rankFor picks the right bracket and progress", () => {
  assert.equal(rankFor(0).rank.name, "Carbon Seedling");
  assert.equal(rankFor(0.3).rank.name, "Pedal Pusher");
  const mid = rankFor(5.5); // Sunday Driver spans 3..8
  assert.equal(mid.rank.name, "Sunday Driver");
  assert.equal(mid.next.name, "Daily Commuter");
  assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);
  const top = rankFor(9999);
  assert.equal(top.rank.name, "Pocket Volcano");
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test("pickEquivalents prefers readable magnitudes and pads to n", () => {
  const picks = pickEquivalents(EQUIVALENTS, 4, 4);
  assert.equal(picks.length, 4);
  for (const p of picks) {
    const q = 4 * p.perKg;
    assert.ok(q >= 0.1 && q < 1e5, `${p.label} → ${q}`);
  }
  // Tiny value: nothing fits the window, still returns n entries.
  assert.equal(pickEquivalents(WATER_EQUIVALENTS, 0, 2).length, 2);
});

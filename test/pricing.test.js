import { test } from "node:test";
import assert from "node:assert/strict";
import { ratesFor, costUsd } from "../src/pricing.js";
import { fmtTinyPercent, fmtUsd, fmtWater } from "../src/render.js";

test("ratesFor matches vendor price points", () => {
  assert.equal(ratesFor("claude-fable-5").input, 10);
  assert.equal(ratesFor("claude-opus-4-8").input, 5);
  assert.equal(ratesFor("claude-opus-4-8").output, 25);
  assert.equal(ratesFor("claude-opus-4-1").input, 15); // old Opus pricing
  assert.equal(ratesFor("claude-sonnet-4-6").input, 3);
  assert.equal(ratesFor("claude-haiku-4-5").output, 5);
  assert.equal(ratesFor("gpt-5.5").input, 1.25);
  assert.equal(ratesFor("gpt-5-mini").input, 0.25);
  assert.equal(ratesFor("gemini-3-flash-preview").output, 2.5);
  assert.equal(ratesFor("gemini-3-pro").output, 12);
  // Unknown model falls back to its energy tier.
  assert.equal(ratesFor("mystery-model-9000").input, 2);
});

test("costUsd prices each token kind", () => {
  // 1M of everything on Opus 4.8: 5 + 25 + 0.5 (cache read) + 6.25 (cache write)
  const usd = costUsd(
    { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 },
    "claude-opus-4-8"
  );
  assert.ok(Math.abs(usd - 36.75) < 1e-9);
  assert.equal(costUsd({ input: 0, output: 0, cacheRead: 0 }, "claude-opus-4-8"), 0);
});

test("formatters stay human", () => {
  assert.equal(fmtUsd(1234), "$1.23k");
  assert.equal(fmtUsd(12.345), "$12.35");
  assert.equal(fmtUsd(0.0042), "$0.0042");
  assert.equal(fmtWater(12.3), "12.3 L");
  assert.equal(fmtWater(0.5), "500 mL");
  assert.equal(fmtTinyPercent(0), "0%");
  assert.equal(fmtTinyPercent(0.5), "50%");
  assert.equal(fmtTinyPercent(3.1e-12), "0.00000000031%");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, getStrings, LANGS } from "../src/i18n.js";
import { render } from "../src/render.js";
import { parseArgs } from "../src/cli.js";
import { RANKS, EQUIVALENTS, WATER_EQUIVALENTS } from "../src/co2.js";

function fakeAgg(kg = 4) {
  // kWh chosen so kg/water track the real ratios closely enough for render.
  const wh = (kg / (1.2 * 0.4)) * 1000;
  return {
    kg,
    wh,
    waterL: (wh / 1000) * 1.2 * 2.0,
    usd: 12.34,
    entries: 3,
    tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
    byModel: new Map([["claude-opus-4-8", { kg, usd: 12.34, tokens: 2 }]]),
    byTool: new Map([
      ["claude", { name: "Claude Code", emoji: "✳️", kg, usd: 12.34, tokens: 2, entries: 3, estimated: false }],
    ]),
    byDay: new Map([["2026-06-01", kg]]),
    firstTs: Date.parse("2026-06-01T00:00:00Z"),
    lastTs: Date.parse("2026-06-02T00:00:00Z"),
  };
}

test("detectLang reads the locale, defaults to English", () => {
  assert.equal(detectLang({ LANG: "fr_FR.UTF-8" }), "fr");
  assert.equal(detectLang({ LC_ALL: "fr_CA.UTF-8", LANG: "en_US.UTF-8" }), "fr");
  assert.equal(detectLang({ LANG: "en_US.UTF-8" }), "en");
  assert.equal(detectLang({}), "en");
});

test("french render is actually french", () => {
  const text = render(fakeAgg(), { color: false, lang: "fr" });
  assert.match(text, /ce que votre IA a brûlé/);
  assert.match(text, /lac Léman/);
  assert.match(text, /C'est comme…/);
  assert.doesNotMatch(text, /what your AI burned/);
});

test("output is information only — no editorializing", () => {
  for (const lang of LANGS) {
    const text = render(fakeAgg(), { color: false, lang });
    assert.doesNotMatch(text, /guilt|culpabilité|shame|honte|verdict/i);
  }
});

test("every rank and equivalent label has a french translation", () => {
  const fr = getStrings("fr");
  for (const r of RANKS) {
    assert.ok(fr.rankNames[r.name], `missing fr rank: ${r.name}`);
  }
  for (const e of [...EQUIVALENTS, ...WATER_EQUIVALENTS]) {
    assert.ok(fr.eqLabels[e.label], `missing fr label: ${e.label}`);
  }
});

test("parseArgs accepts --lang and rejects unknown languages", () => {
  assert.equal(parseArgs([]).lang, undefined);
  assert.equal(parseArgs(["--lang", "fr"]).lang, "fr");
  assert.equal(parseArgs(["--lang=EN"]).lang, "en");
  assert.throws(() => parseArgs(["--lang", "klingon"]));
  assert.ok(LANGS.includes("en") && LANGS.includes("fr"));
});

test("parseArgs accepts -y/--yes to skip the consent prompt", () => {
  assert.equal(parseArgs([]).yes, false);
  assert.equal(parseArgs(["-y"]).yes, true);
  assert.equal(parseArgs(["--yes"]).yes, true);
});

test("both languages carry the consent strings", () => {
  for (const lang of LANGS) {
    const L = getStrings(lang);
    assert.ok(L.consent.length > 20, `missing consent for ${lang}`);
    assert.ok(L.consentDeclined.length > 5, `missing consentDeclined for ${lang}`);
  }
});

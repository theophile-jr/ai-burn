// Emissions model. AI vendors publish almost no per-token energy figures, so
// these constants are triangulated from public LLM inference studies: Epoch
// AI's GPT-4o estimate (~0.3 Wh per ~500-token reply), Google's Gemini
// disclosure (0.24 Wh median prompt) and Mistral's Large 2 lifecycle report
// (~1.14 gCO2e per 400-token reply). Treat every number below as an estimate
// with real uncertainty, not a measurement.

// Wh of IT energy per million tokens, by model tier.
// Prefill (input) is far cheaper per token than decode (output); cache reads
// skip prefill almost entirely; cache writes still pay for prefill.
export const WH_PER_MTOK = {
  frontier: { output: 1200, input: 120, cacheRead: 12 },
  standard: { output: 500, input: 50, cacheRead: 5 },
  light: { output: 100, input: 10, cacheRead: 1 },
};

// Datacenter overhead (cooling, power delivery) on top of IT energy.
export const PUE = 1.2;

// kg CO2e per kWh — world-average grid mix. Real intensity depends on where
// the request was served and when.
export const KG_CO2_PER_KWH = 0.4;

// Liters of fresh water consumed per kWh: on-site evaporative cooling
// (WUE ~1.1 L/kWh, Google's fleet average) plus off-site water consumed
// generating the electricity (~0.9 L/kWh, US grid average). See
// "Making AI Less Thirsty" (Li et al., 2023).
export const WATER_L_PER_KWH = 2.0;

const TIER_RE = [
  // Top-shelf reasoning models: priciest decode, biggest accelerator pools.
  [/opus|fable|gpt-[\d.]+-pro|o1-pro|ultra/, "frontier"],
  // Small/fast models. Checked before "standard" so "gemini-3-flash" wins.
  // "[-.]mini" not bare "mini": "gemini" must not match.
  [/haiku|flash|lite|[-.]mini|nano|gemma/, "light"],
  [/sonnet|gpt-5|gpt-4|gemini|o[134]|deepseek|kimi|qwen|glm|grok|mistral|llama/, "standard"],
];

/** Map a model id like "claude-opus-4-8" or "gpt-5.5" to an energy tier. */
export function tierOf(model) {
  const m = String(model ?? "").toLowerCase();
  for (const [re, tier] of TIER_RE) if (re.test(m)) return tier;
  return "standard"; // unknown models: assume mid-tier
}

/**
 * IT energy in Wh for one API turn.
 * @param {{input:number, output:number, cacheRead:number, cacheWrite?:number}} tokens
 */
export function energyWh(tokens, tier) {
  const r = WH_PER_MTOK[tier] ?? WH_PER_MTOK.standard;
  return (
    ((tokens.input + (tokens.cacheWrite ?? 0)) * r.input +
      tokens.output * r.output +
      tokens.cacheRead * r.cacheRead) /
    1e6
  );
}

/** Facility-level kg CO2e for a given IT energy in Wh. */
export function co2Kg(wh) {
  return (wh / 1000) * PUE * KG_CO2_PER_KWH;
}

/** Liters of fresh water consumed (cooling + power generation) for Wh of IT energy. */
export function waterL(wh) {
  return (wh / 1000) * PUE * WATER_L_PER_KWH;
}

// ── Game layer ──────────────────────────────────────────────────────────────

export const RANKS = [
  { min: 0, emoji: "🌱", name: "Carbon Seedling" },
  { min: 0.05, emoji: "🍃", name: "Gentle Breeze" },
  { min: 0.25, emoji: "🚲", name: "Pedal Pusher" },
  { min: 1, emoji: "🛵", name: "Scooter Smogger" },
  { min: 3, emoji: "🚗", name: "Sunday Driver" },
  { min: 8, emoji: "🚙", name: "Daily Commuter" },
  { min: 20, emoji: "🚛", name: "Diesel Hauler" },
  { min: 50, emoji: "✈️", name: "Frequent Flyer" },
  { min: 120, emoji: "🏭", name: "Smoke Stack Tycoon" },
  { min: 300, emoji: "🌋", name: "Pocket Volcano" },
];

/** Current rank, plus progress toward the next one (null at the top). */
export function rankFor(kg) {
  let i = 0;
  while (i + 1 < RANKS.length && kg >= RANKS[i + 1].min) i++;
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const progress = next
    ? Math.min(1, (kg - rank.min) / (next.min - rank.min))
    : 1;
  return { rank, next, progress };
}

// "That's like…" CO2 conversions. Sources: average petrol car ~170 g/km, a
// full smartphone charge ~12 Wh (~5 g on the same grid mix), one cheeseburger
// ~2.5 kg CO2e lifecycle, a 10 L party balloon holds ~18 g of pure CO2,
// 1 tonne of CO2 melts ~3 m² of Arctic summer sea ice (Notz & Stroeve 2016),
// video streaming ~55 g/h (DIMPACT), a mature tree absorbs ~22 kg/year
// (~60 g/day), one Paris→NYC seat ~1000 kg.
export const EQUIVALENTS = [
  { emoji: "🚗", perKg: 1 / 0.17, unit: "km", label: "in a petrol car" },
  { emoji: "🍔", perKg: 1 / 2.5, unit: "", label: "cheeseburgers" },
  { emoji: "🎈", perKg: 1 / 0.018, unit: "", label: "party balloons of pure CO₂" },
  { emoji: "🧊", perKg: 30, unit: "cm²", label: "of Arctic sea ice, gone" },
  { emoji: "📱", perKg: 1 / 0.005, unit: "", label: "phone charges" },
  { emoji: "📺", perKg: 1 / 0.055, unit: "h", label: "of video streaming" },
  { emoji: "🌳", perKg: 1 / 0.06, unit: "days", label: "for one tree to re-absorb it" },
  { emoji: "✈️", perKg: 0.1, unit: "%", label: "of a Paris→NYC flight" },
];

// Water conversions. An espresso shot is 30 mL, a bottle 0.5 L, a bathtub
// ~150 L, an Olympic pool 2.5 ML, a raindrop ~0.05 mL, Lake Geneva 89 km³.
export const WATER_EQUIVALENTS = [
  { emoji: "☕", perL: 1 / 0.03, unit: "", label: "espresso shots, evaporated" },
  { emoji: "🥤", perL: 2, unit: "", label: "half-litre bottles" },
  { emoji: "🌧️", perL: 20000, unit: "", label: "raindrops" },
  { emoji: "🛁", perL: 1 / 150, unit: "", label: "bathtubs" },
  { emoji: "🏊", perL: 1 / 2.5e6, unit: "", label: "Olympic pools" },
];

/** Liters in Lake Geneva — for the only stat that truly matters. */
export const LAKE_GENEVA_L = 8.9e13;

/**
 * Pick the `n` most readable equivalents for a value: quantities land in
 * [0.1, 100k) where possible, keeping the list order (most fun first).
 */
export function pickEquivalents(list, value, n) {
  const nice = list.filter((e) => {
    const q = value * (e.perKg ?? e.perL);
    return q >= 0.1 && q < 1e5;
  });
  const picked = nice.slice(0, n);
  for (const e of list) {
    if (picked.length >= n) break;
    if (!picked.includes(e)) picked.push(e);
  }
  return picked;
}

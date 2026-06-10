// Retail pay-as-you-go API pricing, in $ per million tokens — what this usage
// would have cost without a subscription. Cache reads are ~0.1× the input
// price across vendors; cache writes ~1.25× (Anthropic 5-minute TTL).
// Prices move often: these are list prices as of mid-2026. PRs welcome.
import { tierOf } from "./co2.js";

const P = (input, output, cacheRead = input / 10, cacheWrite = input * 1.25) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
});

// First regex match wins — keep more specific patterns first.
export const PRICES = [
  // Anthropic
  [/fable/, P(10, 50)],
  [/opus-4-[01](?!\d)|claude-3-opus|opus-4-2025/, P(15, 75)], // Opus ≤4.1
  [/opus/, P(5, 25)], // Opus 4.5+
  [/sonnet/, P(3, 15)],
  [/haiku/, P(1, 5)],
  // OpenAI
  [/gpt-5[.\d-]*nano/, P(0.05, 0.4)],
  [/gpt-5[.\d-]*mini/, P(0.25, 2)],
  [/gpt-5|codex/, P(1.25, 10)],
  [/gpt-4o-mini/, P(0.15, 0.6)],
  [/gpt-4o/, P(2.5, 10)],
  [/gpt-4\.1|o3(?!-pro)/, P(2, 8)],
  [/o[14]-mini/, P(1.1, 4.4)],
  // Google
  [/gemini[\d.-]*flash-lite/, P(0.1, 0.4)],
  [/gemini[\d.-]*.*flash/, P(0.3, 2.5)],
  [/gemini-3.*pro/, P(2, 12)],
  [/gemini.*pro/, P(1.25, 10)],
  // A rough catch-all for the open-weight crowd served via APIs.
  [/deepseek|kimi|qwen|glm|llama|mistral|grok/, P(0.6, 2.5)],
];

const TIER_FALLBACK = {
  frontier: P(5, 25),
  standard: P(2, 10),
  light: P(0.3, 1.5),
};

/** $/MTok rates for a model id, falling back to its energy tier. */
export function ratesFor(model) {
  const m = String(model ?? "").toLowerCase();
  for (const [re, rates] of PRICES) if (re.test(m)) return rates;
  return TIER_FALLBACK[tierOf(model)];
}

/**
 * Retail cost in USD for one API turn.
 * @param {{input:number, output:number, cacheRead:number, cacheWrite?:number}} tokens
 */
export function costUsd(tokens, model) {
  const r = ratesFor(model);
  return (
    (tokens.input * r.input +
      tokens.output * r.output +
      tokens.cacheRead * r.cacheRead +
      (tokens.cacheWrite ?? 0) * r.cacheWrite) /
    1e6
  );
}

import {
  rankFor,
  pickEquivalents,
  EQUIVALENTS,
  WATER_EQUIVALENTS,
  LAKE_GENEVA_L,
} from "./co2.js";
import { getStrings, tr } from "./i18n.js";

export function makeStyles(color) {
  const wrap = (open, close) => (s) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
    green: wrap("32", "39"),
    yellow: wrap("33", "39"),
    red: wrap("31", "39"),
    cyan: wrap("36", "39"),
    blue: wrap("34", "39"),
    magenta: wrap("35", "39"),
    gray: wrap("90", "39"),
  };
}

export function fmtCo2(kg) {
  if (kg < 0.001) return `${(kg * 1e6).toFixed(0)} mg`;
  if (kg < 1) return `${parseFloat((kg * 1000).toPrecision(3))} g`;
  if (kg < 100) return `${parseFloat(kg.toPrecision(3))} kg`;
  return `${Math.round(kg)} kg`;
}

export function fmtNum(n) {
  if (n >= 1e9) return `${(n / 1e9).toPrecision(3)}B`;
  if (n >= 1e6) return `${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1e3) return `${(n / 1e3).toPrecision(3)}k`;
  return `${Math.round(n)}`;
}

export function fmtUsd(usd) {
  if (usd >= 1000) return `$${fmtNum(usd)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${parseFloat(usd.toPrecision(2))}`;
}

export function fmtWater(l) {
  if (l < 0.001) return `${(l * 1e6).toFixed(0)} µL`;
  if (l < 1) return `${parseFloat((l * 1000).toPrecision(3))} mL`;
  return `${parseFloat(l.toPrecision(3))} L`;
}

function fmtQty(n) {
  if (n >= 1000) return fmtNum(n);
  if (n >= 10) return `${Math.round(n)}`;
  return `${n.toPrecision(2)}`;
}

/** "0.0000000031%" — the most honest way to compare yourself to a lake. */
export function fmtTinyPercent(fraction) {
  const pct = fraction * 100;
  if (pct === 0) return "0%";
  if (pct >= 0.01) return `${parseFloat(pct.toPrecision(2))}%`;
  const zeros = Math.max(0, -Math.floor(Math.log10(pct)) - 1);
  if (zeros > 16) return `${pct.toExponential(1)}%`;
  const digits = Math.round(pct * 10 ** (zeros + 2));
  return `0.${"0".repeat(zeros)}${digits}%`;
}

function bar(progress, width, styles, paint) {
  const filled = Math.round(progress * width);
  return (
    paint("█".repeat(filled)) + styles.gray("░".repeat(width - filled))
  );
}

function prettyDay(day, lang) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Render the aggregate from collectUsage() as a terminal report.
 * @param {{color?: boolean, days?: number, lang?: "en"|"fr"}} opts
 */
export function render(agg, opts = {}) {
  const s = makeStyles(opts.color ?? true);
  const L = getStrings(opts.lang ?? "en");
  const out = [];
  const push = (line = "") => out.push(line ? `  ${line}` : "");

  const window = Number.isFinite(opts.days) ? L.lastDays(opts.days) : L.allTime;

  push();
  push(`${s.bold("🔥 ai-burn")} ${s.dim(L.subtitle(window))}`);
  push();

  if (agg.entries === 0) {
    push(s.dim(L.empty));
    push();
    return out.join("\n");
  }

  // Headline: carbon, water, money.
  const headline = [
    `${s.bold(s.yellow(fmtCo2(agg.kg)))} ${s.bold(L.co2e)}`,
    `${s.bold(s.cyan(fmtWater(agg.waterL)))} ${s.bold(L.ofWater)}`,
  ];
  if (agg.usd >= 0.005) {
    headline.push(`${s.bold(s.green(fmtUsd(agg.usd)))} ${s.bold(L.atApiPrices)}`);
  }
  push(headline.join(s.dim("   ·   ")));
  push();

  const { rank, next, progress } = rankFor(agg.kg);
  push(`${rank.emoji} ${s.bold(tr(L, "rankNames", rank.name))}`);
  if (next) {
    const nextName = `${next.emoji} ${tr(L, "rankNames", next.name)}`;
    push(
      `${bar(progress, 22, s, s.green)} ${s.dim(
        L.toNext(Math.round(progress * 100), nextName, fmtCo2(next.min))
      )}`
    );
  } else {
    push(s.red(L.maxRank));
  }
  push();

  push(s.dim(L.thatsLike));
  for (const eq of pickEquivalents(EQUIVALENTS, agg.kg, 4)) {
    const qty = agg.kg * eq.perKg;
    const unit = eq.unit ? `${tr(L, "units", eq.unit)} ` : "";
    push(`${eq.emoji} ${s.cyan(fmtQty(qty))} ${unit}${tr(L, "eqLabels", eq.label)}`);
  }
  push();

  push(s.dim(L.machinesDrank));
  for (const eq of pickEquivalents(WATER_EQUIVALENTS, agg.waterL, 2)) {
    const qty = agg.waterL * eq.perL;
    push(`${eq.emoji} ${s.blue(fmtQty(qty))} ${tr(L, "eqLabels", eq.label)}`);
  }
  push(`🌊 ${s.blue(fmtTinyPercent(agg.waterL / LAKE_GENEVA_L))} ${L.lakeGeneva}`);
  push();

  // Per-tool breakdown — only worth a section with 2+ tools.
  const tools = [...agg.byTool.values()].sort((a, b) => b.kg - a.kg);
  if (tools.length > 1) {
    push(s.dim(L.byTool));
    const nameWidth = Math.max(...tools.map((t) => t.name.length));
    for (const t of tools) {
      const share = agg.kg > 0 ? t.kg / agg.kg : 0;
      const cells = [
        `${t.emoji} ${s.bold(t.name.padEnd(nameWidth))}`,
        bar(share, 12, s, s.yellow),
        `${fmtCo2(t.kg)}`.padStart(7),
        s.dim(`${Math.round(share * 100)}%`.padStart(4)),
        s.green(fmtUsd(t.usd).padStart(8)),
      ];
      if (t.estimated) cells.push(s.dim("≈"));
      push(cells.join(" "));
    }
    push();
  }

  // Stats strip
  const days =
    agg.firstTs !== null
      ? Math.max(1, Math.ceil((agg.lastTs - agg.firstTs) / 86_400_000))
      : 1;
  const perDay = agg.kg / days;
  let worstDay = null;
  for (const [day, kg] of agg.byDay) {
    if (!worstDay || kg > worstDay.kg) worstDay = { day, kg };
  }
  const parts = [
    `⚡ ${fmtQty(agg.wh / 1000)} kWh`,
    `🔤 ${fmtNum(agg.tokens.total)} ${L.tokens}`,
    `📅 ${fmtCo2(perDay)}${L.perDay}`,
  ];
  if (worstDay) {
    parts.push(`🔥 ${L.worst} ${fmtCo2(worstDay.kg)} (${prettyDay(worstDay.day, opts.lang)})`);
  }
  push(s.dim(parts.join("   ")));

  let topModel = null;
  for (const [model, m] of agg.byModel) {
    if (!topModel || m.kg > topModel.kg) topModel = { model, kg: m.kg };
  }
  if (topModel && agg.kg > 0) {
    const share = Math.round((topModel.kg / agg.kg) * 100);
    push(s.dim(`🏆 ${L.topModel} ${s.magenta(topModel.model)} (${share}%)`));
  }
  push();

  push(s.gray(L.footer));
  if (opts.shareHint !== false) push(s.gray(L.shareHint));
  push();
  return out.join("\n");
}

/**
 * A clean, copy-pasteable one-shot summary for social media — no colors,
 * no ANSI, ready to drop into Reddit / X / a chat.
 */
export function buildShare(agg, opts = {}) {
  const L = getStrings(opts.lang ?? "en");
  if (agg.entries === 0) return L.shareEmpty;
  const { rank } = rankFor(agg.kg);
  const carEq = EQUIVALENTS.find((e) => e.label === "in a petrol car");
  const km = carEq ? fmtQty(agg.kg * carEq.perKg) : null;
  return L.share({
    co2: fmtCo2(agg.kg),
    water: fmtWater(agg.waterL),
    rank: `${rank.emoji} ${tr(L, "rankNames", rank.name)}`,
    km,
  });
}

export function toJson(agg, opts = {}) {
  const { rank, next, progress } = rankFor(agg.kg);
  return {
    window_days: Number.isFinite(opts.days) ? opts.days : null,
    co2_kg: agg.kg,
    energy_kwh: agg.wh / 1000,
    water_l: agg.waterL,
    retail_cost_usd: agg.usd,
    tokens: agg.tokens,
    api_turns: agg.entries,
    first_activity: agg.firstTs ? new Date(agg.firstTs).toISOString() : null,
    last_activity: agg.lastTs ? new Date(agg.lastTs).toISOString() : null,
    rank: { emoji: rank.emoji, name: rank.name, progress_to_next: progress, next: next?.name ?? null },
    by_tool: Object.fromEntries(
      [...agg.byTool].map(([id, t]) => [
        id,
        {
          name: t.name,
          co2_kg: t.kg,
          retail_cost_usd: t.usd,
          tokens: t.tokens,
          api_turns: t.entries,
          estimated: t.estimated,
        },
      ])
    ),
    by_model: Object.fromEntries(
      [...agg.byModel].map(([m, v]) => [
        m,
        { co2_kg: v.kg, retail_cost_usd: v.usd, tokens: v.tokens },
      ])
    ),
    by_day_co2_kg: Object.fromEntries(agg.byDay),
    equivalents: Object.fromEntries(
      EQUIVALENTS.map((e) => [e.label, agg.kg * e.perKg])
    ),
    water_equivalents: Object.fromEntries(
      WATER_EQUIVALENTS.map((e) => [e.label, agg.waterL * e.perL])
    ),
    lake_geneva_share: agg.waterL / LAKE_GENEVA_L,
  };
}

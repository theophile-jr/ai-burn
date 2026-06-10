import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { collectUsage, SOURCE_IDS } from "./usage.js";
import { render, toJson, buildShare, makeStyles } from "./render.js";
import { LANGS, detectLang, getStrings } from "./i18n.js";

const HELP = `
  🔥 ai-burn — CO₂, water and money burned by your AI coding tools

  Reads the local history of Claude Code, Gemini CLI, Codex CLI, Cursor and
  OpenCode, then converts your tokens into energy, emissions, water and what
  the same usage would cost at retail API prices. Fully local — ai-burn never
  makes a network request.

  Usage
    npx ai-burn [options]

  Options
    --days <n>     Only count the last n days (default: all time)
    --tools <ids>  Comma-separated subset of: ${SOURCE_IDS.join(", ")}
    --lang <code>  Report language: ${LANGS.join(", ")} (default: your locale)
    --share        Print a clean, copy-pasteable summary to share
    --json         Machine-readable output (always English keys)
    --no-color     Disable colors (NO_COLOR env is also respected)
    -y, --yes      Skip the confirmation prompt
    -v, --version  Print version
    -h, --help     Show this help

  All figures are estimates — see the README for the methodology.
`;

export function parseArgs(argv) {
  const opts = {
    days: Infinity,
    tools: undefined,
    lang: undefined,
    json: false,
    share: false,
    color: true,
    yes: false,
    help: false,
    version: false,
  };
  const setDays = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error("--days expects a positive number");
    opts.days = n;
  };
  const setTools = (raw) => {
    const tools = String(raw ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tools.length === 0) throw new Error("--tools expects a comma-separated list");
    for (const t of tools) {
      if (!SOURCE_IDS.includes(t)) {
        throw new Error(`unknown tool "${t}" (known: ${SOURCE_IDS.join(", ")})`);
      }
    }
    opts.tools = tools;
  };
  const setLang = (raw) => {
    const lang = String(raw ?? "").trim().toLowerCase();
    if (!LANGS.includes(lang)) {
      throw new Error(`unknown language "${raw}" (known: ${LANGS.join(", ")})`);
    }
    opts.lang = lang;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--share") opts.share = true;
    else if (a === "--no-color") opts.color = false;
    else if (a === "-y" || a === "--yes") opts.yes = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-v" || a === "--version") opts.version = true;
    else if (a === "--days") setDays(argv[++i]);
    else if (a.startsWith("--days=")) setDays(a.slice(7));
    else if (a === "--tools") setTools(argv[++i]);
    else if (a.startsWith("--tools=")) setTools(a.slice(8));
    else if (a === "--lang") setLang(argv[++i]);
    else if (a.startsWith("--lang=")) setLang(a.slice(7));
    else throw new Error(`unknown option "${a}" (try --help)`);
  }
  return opts;
}

/** A colored "[Y/n]" suffix for prompts. */
const ynBadge = (s) =>
  `${s.dim("[")}${s.green("Y")}${s.dim("/")}${s.red("n")}${s.dim("]")}`;

/** Ask a single question on stderr; Enter or anything but n/no/non = yes. */
async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return !/^(n|no|non)$/.test(answer);
  } finally {
    rl.close();
  }
}

/** Consent gate before touching any file. */
async function askConsent(L, s) {
  process.stderr.write(`\n  ${s.bold("🔥 ai-burn")} ${s.dim(L.consent)}\n\n`);
  return askYesNo(`  ${s.bold(L.consentAsk)} ${ynBadge(s)} `);
}

/** Offer the copy-pasteable share snippet after the report. */
async function askShare(L, s) {
  return askYesNo(`\n  ${s.bold(`📋 ${L.sharePrompt}`)} ${ynBadge(s)} `);
}

export async function main(argv) {
  const opts = parseArgs(argv);

  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.version) {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    console.log(pkg.version);
    return;
  }

  const lang = opts.lang ?? detectLang();
  const L = getStrings(lang);

  const interactive =
    process.stdin.isTTY === true && process.stderr.isTTY === true;
  const promptColor =
    opts.color && process.stderr.isTTY === true && !process.env.NO_COLOR;
  const ps = makeStyles(promptColor);

  // Consent gate: nothing is read until the user says yes. Skipped with
  // --yes, or when there's no interactive terminal to ask on.
  if (!opts.yes && interactive) {
    if (!(await askConsent(L, ps))) {
      console.log(`  ${ps.dim(L.consentDeclined)}`);
      return;
    }
  }

  const color =
    opts.color && process.stdout.isTTY === true && !process.env.NO_COLOR;

  const agg = await collectUsage({ days: opts.days, tools: opts.tools });

  if (opts.json) {
    console.log(JSON.stringify(toJson(agg, opts), null, 2));
    return;
  }
  if (opts.share) {
    console.log(buildShare(agg, { lang }));
    return;
  }

  // On an interactive run with results, offer the share snippet afterwards
  // (and drop the static hint, since we're asking directly).
  const offerShare = interactive && !opts.yes && agg.entries > 0;
  console.log(render(agg, { color, days: opts.days, lang, shareHint: !offerShare }));
  if (offerShare && (await askShare(L, ps))) {
    console.log(`\n${buildShare(agg, { lang })}\n`);
  }
}

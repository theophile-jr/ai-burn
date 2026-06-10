# 🔥 ai-burn

How much CO₂ has your AI tooling emitted? How much water did it drink? What
would it have cost without your subscription? One command, fully local.

```bash
npx ai-burn
```

```
  🔥 ai-burn — what your AI burned (all time)

  9.82 kg CO₂e   ·   49.1 L of water   ·   $709.55 at API prices

  🚙 Daily Commuter
  ███░░░░░░░░░░░░░░░░░░░ 15% to 🚛 Diesel Hauler (20 kg)

  That's like…
  🚗 58 km in a petrol car
  🍔 3.9 cheeseburgers
  🎈 545 party balloons of pure CO₂
  🧊 295 cm² of Arctic sea ice, gone

  …and your machines drank
  ☕ 1.64k espresso shots, evaporated
  🥤 98 half-litre bottles
  🌊 0.000000000055% of Lake Geneva

  By tool
  ✳️ Claude Code ██████████░░    8 kg  81%  $664.00
  🔓 OpenCode    ██░░░░░░░░░░ 1.73 kg  18%   $40.75
  🌀 Codex CLI   ░░░░░░░░░░░░  56.1 g   1%    $2.79
  🖱️ Cursor      ░░░░░░░░░░░░  28.3 g   0%    $1.77 ≈
  ♊ Gemini CLI  ░░░░░░░░░░░░  4.31 g   0%    $0.24

  ⚡ 20 kWh   🔤 1.02B tokens   📅 23.9 g/day   🔥 peak day: 1.91 kg (Jun 6)
  🏆 top model: claude-opus-4-8 (43%)

  Rough estimates — run with --json for raw numbers, README for methodology.
```

Everything runs locally: it reads the session history your AI tools already
keep on disk, counts your tokens, and converts them to energy, emissions,
water and money. Nothing is uploaded anywhere — ai-burn never makes a network
request. The output is information, plain and simple: what you do with it is
up to you.

Parle aussi français : `--lang fr` (auto-detected from your locale).

Website: [ai-burn.onrender.com](https://ai-burn.onrender.com)

## Supported tools

| Tool | Where it reads | Token counts |
| --- | --- | --- |
| ✳️ **Claude Code** | `~/.claude/projects/**/*.jsonl` | exact (per API turn) |
| ♊ **Gemini CLI** | `~/.gemini/tmp/*/chats/*.json` | exact |
| 🌀 **Codex CLI** | `~/.codex/sessions/**/*.jsonl` | exact |
| 🖱️ **Cursor** | `…/Cursor/User/globalStorage/state.vscdb` | exact tokens, model unknown (≈) |
| 🔓 **OpenCode** | `~/.local/share/opencode/opencode.db` | exact (+ its own cost figures) |

Cursor and OpenCode are SQLite databases, so those two need the `sqlite3` CLI
on your PATH (preinstalled on macOS; `apt/dnf install sqlite3` elsewhere).
Missing tools are silently skipped. Using something we don't read yet? PRs
welcome — a source is ~60 lines in [`src/sources/`](src/sources/).

## Options

| Flag           | Effect                                              |
| -------------- | --------------------------------------------------- |
| `--days <n>`   | Only count the last *n* days                        |
| `--tools <ids>`| Subset of `claude,gemini,codex,cursor,opencode`     |
| `--lang <code>`| Report language: `en`, `fr` (default: your locale)  |
| `--json`       | Machine-readable output (always English keys)       |
| `--no-color`   | Plain text (`NO_COLOR` also respected)              |
| `-y`, `--yes`  | Skip the confirmation prompt                        |

## Privacy & safety

- **Asks first.** Before reading anything, ai-burn asks for a Y/n
  confirmation in your terminal (skip with `--yes`; non-interactive runs
  proceed, since there is no one to ask).
- **Fully local.** No network access at all — zero HTTP requests, no
  telemetry, no analytics, nothing phones home. The only runtime dependency
  is Node's standard library (plus the `sqlite3` CLI for two of the sources).
- **Never touches credentials.** The tool databases it reads also contain
  auth tokens (e.g. OpenCode's `account` table). The queries here only read
  chat/usage rows — never auth tables, never `auth.json`, never key files.
- **No content leaves the math.** Your prompts and code are never parsed for
  meaning, stored, or displayed — only token *counts*, models and timestamps.

## Methodology (a.k.a. how wrong is this?)

Vendors publish almost no per-token energy figures, so this is an
**estimate**, triangulated from public LLM-inference studies (Epoch AI's
GPT-4o estimate, Google's Gemini per-prompt disclosure, Mistral's Large 2
lifecycle report):

1. **Tokens** are read per API turn from each tool's local history and deduped
   across resumed/forked/checkpointed sessions.
2. **Energy**: each model gets a Wh-per-million-tokens rate by tier
   (frontier — Opus/Fable-class: 1200 Wh/M output; standard — Sonnet/GPT-5/
   Gemini-Pro-class: 500; light — Haiku/Flash/mini-class: 100). Input tokens
   count at 1/10 of the output rate (prefill is much cheaper), cache reads at
   1/100, cache writes like input. Datacenter overhead (PUE) of 1.2 applies.
3. **Carbon**: 0.4 kg CO₂e per kWh (world-average grid mix).
4. **Water**: 2.0 L per kWh — on-site evaporative cooling (~1.1 L/kWh,
   Google's fleet WUE) plus water consumed generating the electricity
   (~0.9 L/kWh). See *Making AI Less Thirsty* (Li et al., 2023).
5. **Money**: retail pay-as-you-go API list prices per model
   ([`src/pricing.js`](src/pricing.js)), with cache reads at ~0.1× and cache
   writes at ~1.25× the input price — i.e. what your usage would cost if you
   weren't on a subscription. OpenCode records its own per-message cost; we
   trust it when present.

Real numbers depend on hardware, batching, datacenter location, grid mix and
the phase of the vendor's pricing moon — expect the truth to be within a
factor of a few, in either direction. All constants live in
[`src/co2.js`](src/co2.js) and [`src/pricing.js`](src/pricing.js); PRs with
better-sourced numbers are welcome.

## License

MIT — made by Théophile J-R.

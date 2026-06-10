# Publishing to npm

The package and the bin are both named **`ai-burn`**, so users get:

```bash
npx ai-burn
```

## Prerequisites

- An npmjs.com account with 2FA enabled.
- Logged in locally: `npm login` (check with `npm whoami`).

## Checklist before every release

```bash
npm test                    # all tests green
node bin/ai-burn.js         # eyeball the real output
node bin/ai-burn.js --json  # valid JSON
npm pack --dry-run          # only bin/, src/, README, LICENSE, package.json
```

## First publish

```bash
npm publish --access public
npx ai-burn                 # verify from the registry (use a clean shell)
```

## Subsequent releases

```bash
npm version patch   # or minor / major — bumps package.json + git tag
npm publish
git push --follow-tags
```

## Maintenance notes

- **Zero runtime dependencies and zero network access** — keep it that way;
  `npx` startup time is the product, and "never makes a network request" is a
  documented guarantee. If you're tempted to add chalk/boxen or telemetry,
  don't.
- Emissions constants live in `src/co2.js` with sources in comments. When
  better public data appears (e.g. a vendor publishes per-token figures),
  update the constants and cut a **minor** release, noting the methodology
  change in the README.
- New model families only need a regex entry in `TIER_RE` (`src/co2.js`) if
  they don't already match `opus|fable|sonnet|haiku` etc., and a price row in
  `src/pricing.js`.
- The landing page lives in `site/index.html` and is deployed at
  https://ai-burn.onrender.com (static site on Render). It is fully
  self-contained — no external fonts, scripts or analytics.

# AirCompass day-1 kit

Verified skeleton for the two things most likely to hurt on day 1: **nonce CSP on Next.js 16 and honest tests**.
Built and verified locally on Next 16.4.6 / Node 22 with a *production* build (`next build && next start`) and Playwright.
**Not yet verified on Vercel: that is your first task** (below).

## Do this first (30 minutes)

```bash
unzip aircompass-day1-kit.zip && cd aircompass-day1-kit
npm ci
npm run verify                  # lint, types, oracle check, tests, build
npm run mutate                  # optional, about 1 minute
npm run csp:smoke               # builds, starts, runs the CSP/hydration/header gate locally
git init && git add -A && git commit -m "chore: day-1 skeleton"
# push to GitHub, import the repo in Vercel, deploy to PRODUCTION (not a protected preview), then:
BASE_URL=https://<your-project>.vercel.app npx playwright test csp
```

All six `csp` tests must pass on the deployed URL. If any fail, use the ladder in plan.md section 7.1 and timebox it to 60 minutes.

## What is here

| Path | Purpose |
|---|---|
| `src/proxy.ts` | per-request nonce CSP (Next 16 name; was `middleware.ts`). Pages only; API and static assets are excluded by the matcher |
| `next.config.ts` | static security headers for *every* route (incl. API), Cache Components and partial prefetching **off** (see comment), `poweredByHeader: false` |
| `tests/e2e/csp.spec.ts` | hydration works, zero CSP violations, nonce on every inline tag and unique per request, strict script-src, HTML not publicly cacheable, headers on pages and API |
| `scripts/oracle.mjs` | independent source of truth for expected numbers; `--check` fails CI if `golden.json` was hand-edited |
| `tests/fixtures/golden.json` | generated golden vectors (EPA AQI, NAQI, indoor model, window finder, CO2e) |
| `src/lib/engine/{bands,naqi,indoor}.ts` | reference implementations that pass the golden vectors; extend, do not rewrite blindly |
| `src/lib/llm/guard.ts` | output guard: unicode-normalised digit/number-word/unit/markup/medical/canary checks, token rendering, language check, chat numeric faithfulness |
| `tests/security/guard.corpus.json` | 70 adversarial rows (each names the specific rule that must fire), 25 benign rows, 120 sweep items covering every alternative inside each rule |
| `stryker.config.json` | `npm run mutate`: mutation testing on `src/lib/engine` + `guard.ts`. Measured 25 Nov: **92.8 %** (engine 95.5 %, guard 90.6 %) from 18 tests; the first draft scored 66.3 % until `naqi()` and rule-specific assertions were added. Survivors are mostly error-message strings |
| `data/number-words.hi.json` | Hindi number words: a starter list that needs a native reader's review |
| `AGENTS.md` | Next's block plus the project rules (anti test-bloat, oracle rule, CSP rule) |
| `.github/workflows/ci.yml` | not executed here; first push will tell you. The audit gate is `--omit=dev`: on 25 Nov the dev-only `tinypool` advisory (critical, via vitest 3) cannot be fixed because Stryker's vitest runner needs vitest 3; production dependencies had 0 findings. Record this in `SECURITY.md` and revisit when Stryker supports vitest 5 |

`it.todo` entries in `tests/golden/golden.test.ts` are the executable spec for tickets T05 to T07.

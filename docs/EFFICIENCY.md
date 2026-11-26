# Efficiency

Measured 2026-11-26 on 13th Gen Intel(R) Core(TM) i5-13450HX · win32 10.0.26300 · Node v24.15.0. Reproduce with `npm run build && npm run measure`.
The real Gemini row is one live call on that day; it is not a percentile and it may fall back.

| Measurement | Result |
|---|---:|
| Engine `selectActions` + `computeExposure`, p50 / p95 (200 runs) | 1.4 / 3.6 ms |
| `generatePlan` with recorded model response, p50 / p95 (20 runs) | 6.8 / 27.1 ms |
| First-load JS, gzipped | / 193 kB · /plan 195 kB · /impact 193 kB · /brief 191 kB · /setup 191 kB · /about 189 kB |
| Live `generatePlan` (one call) | 16923.0 ms; outcome **fallback**; tokens 3599 in / 914 out |

## Budget

- One structured model call per plan, at most one repair call.
- 1 h upstream cache keyed by rounded coordinates; Open-Meteo air and weather fetched in parallel.
- The plan prompt is static; only the facts block changes, so the provider can reuse its prefix cache.
- What-if recomputation is client-side; charts are inline SVG/CSS, not a charting bundle.
- `maxOutputTokens` is capped at 4800; a timeout or provider error returns the deterministic engine plan.

## Notes

- The engine is pure TypeScript and runs in single-digit milliseconds locally; the real cost is the upstream API and model latency.
- The production build is served by `next start`; e2e and CSP gates run against that build, not `next dev`.
- Lighthouse was not run by this script. Record any manual run in `docs/ACCESSIBILITY.md` with the date and device.

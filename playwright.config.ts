import { defineConfig } from "@playwright/test";

/**
 * Local: builds the PRODUCTION bundle and serves it on a dedicated port. It never reuses a running server:
 * a stale server from a previous build silently gives false results (this happened while building the kit).
 * Remote: BASE_URL=https://<project>.vercel.app npx playwright test csp
 */
const PORT = Number(process.env.CSP_PORT ?? 3217);
const base = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: base },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${PORT}`,
        url: base,
        timeout: 240_000,
        reuseExistingServer: false,
        // Never call Gemini from e2e/axe: plans must be the deterministic engine fallback.
        env: { GEMINI_API_KEY: "" },
      },
});
